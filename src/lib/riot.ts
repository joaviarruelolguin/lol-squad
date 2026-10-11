import { RiotRegion, RegionalRouting } from './types';
import { RiotApiError } from './errors';
import { SimpleCache } from './cache';
import { getRiotKey } from './riotKey';

export function getRegionalRouting(region: RiotRegion): RegionalRouting {
  switch (region) {
    case 'la1':
    case 'la2':
    case 'na1':
    case 'br1':
      return 'americas';
    case 'euw1':
      return 'europe';
    default:
      return 'americas';
  }
}

// Caché compartida en memoria (vive mientras dura el proceso del servidor)
export const cache = new SimpleCache(5 * 60 * 1000);

// ============================================================
// Rate limiter global: las dev keys de Riot permiten ~2 req/seg
// Serializamos las peticiones para no comernos el 429.
//
// El intervalo es adaptativo: cuando Riot responde 429, `penalize()` sube el
// piso de espera para TODAS las requests encoladas (no solo la que falló).
// Sin esto un 429 disparaba una cascada: cada request fallaba dos veces,
// esperaba 1,3s + 2,3s, y el endpoint pasaba de 16s a 50s de golpe.
// ============================================================
class RateLimiter {
  private queue: Promise<unknown> = Promise.resolve();
  private lastCall = 0;
  private baseInterval: number;
  /** Piso de espera impuesto por los 429 recientes. Se relaja solo con el tiempo. */
  private penaltyUntil = 0;
  private penaltyInterval = 0;

  constructor(requestsPerSecond = 2) {
    this.baseInterval = 1000 / requestsPerSecond;
  }

  /** Cuánto hay que esperar entre requests ahora mismo */
  private intervalFor(): number {
    if (Date.now() >= this.penaltyUntil) {
      this.penaltyInterval = 0;
      return this.baseInterval;
    }
    return Math.max(this.baseInterval, this.penaltyInterval);
  }

  /**
   * Riot nos pidió esperar. Subimos el piso de la cola para que también lo
   * respeten las requests que ya estaban encoladas.
   */
  penalize(ms: number): void {
    this.penaltyInterval = Math.max(this.penaltyInterval, ms);
    this.penaltyUntil = Math.max(this.penaltyUntil, Date.now() + ms);
  }

  /** Encola una tarea y la ejecuta respetando el intervalo mínimo */
  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(async () => {
      const wait = this.lastCall + this.intervalFor() - Date.now();
      if (wait > 0) {
        await new Promise((r) => setTimeout(r, wait));
      }
      this.lastCall = Date.now();
      return task();
    });
    // Mantenemos la cadena viva aunque una tarea falle
    this.queue = result.catch(() => undefined);
    return result;
  }
}

const globalRateLimiter = new RateLimiter(2);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Reintenta ante errores transitorios (429, 5xx, timeout de red).
 * Backoff exponencial con jitter para no sincronizar los reintentos.
 *
 * Cada espera es UNA sola vez. Antes había dos (el cooldown global al principio
 * del loop y el backoff al final), lo que duplicaba el tiempo de cada 429.
 * Ahora el aviso para "los demás" va por `globalRateLimiter.penalize()`, que
 * frena la cola, y esta request espera solo su backoff.
 */
async function withRetries<T>(
  task: () => Promise<T>,
  opts: { maxAttempts?: number; label?: string } = {}
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await task();
    } catch (err) {
      lastError = err;

      const type = err instanceof RiotApiError ? err.type : null;
      const isRetryable =
        type === 'RATE_LIMIT' ||
        type === 'SERVER_ERROR' ||
        type === 'NETWORK_ERROR';

      if (!isRetryable || attempt === maxAttempts) {
        throw err;
      }

      // Backoff exponencial: 1s, 2s, 4s... + jitter
      const baseDelay = 1000 * Math.pow(2, attempt - 1);
      const jitter = Math.random() * 500;
      const delay = Math.min(baseDelay + jitter, 15000);

      // Si fue un 429, frenamos toda la cola (no solo esta request) y esta
      // espera su propio backoff. Una sola espera por intento.
      if (type === 'RATE_LIMIT') {
        globalRateLimiter.penalize(delay);
      }

      console.warn(
        `[riot] ${opts.label || 'request'} intento ${attempt}/${maxAttempts} falló (${type}). Reintentando en ${Math.round(delay)}ms`
      );
      await sleep(delay);
    }
  }

  throw lastError;
}

// TTLs específicos por tipo de dato
const TTL = {
  account: 24 * 60 * 60 * 1000,   // 24h: el Riot ID casi no cambia
  summoner: 60 * 60 * 1000,       // 1h: icono/nivel
  league: 5 * 60 * 1000,          // 5min: rangos y LP cambian seguido
  mastery: 30 * 60 * 1000,        // 30min: maestría
  matchIds: 2 * 60 * 1000,        // 2min: el historial crece
  matchDetail: 24 * 60 * 60 * 1000, // 24h: una partida terminada NUNCA cambia
};

export class RiotApiClient {
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  private async getApiKey(): Promise<string> {
    // Prioridad: key explícita (tests) > key dinámica (Supabase/.env)
    if (this.apiKey) return this.apiKey;
    return getRiotKey();
  }

  private async fetchRiot<T>(url: string, ttlMs?: number): Promise<T> {
    // 1. Revisar caché
    const cached = cache.get<T>(url);
    if (cached !== undefined) {
      return cached;
    }

    // 2. Consultar Riot (con rate limit global + reintentos automáticos)
    const token = await this.getApiKey();
    const label = url.split('/').slice(-2).join('/').slice(0, 60);

    const data = await withRetries(
      () =>
        globalRateLimiter.run(async () => {
          let res: Response;
          try {
            res = await fetch(url, {
              headers: { 'X-Riot-Token': token },
            });
          } catch (err) {
            throw RiotApiError.network(err);
          }

          if (!res.ok) {
            let detail = `${res.status} ${res.statusText}`;
            try {
              const text = await res.text();
              try {
                const parsed = JSON.parse(text);
                detail = parsed?.status?.message || detail;
              } catch {
                detail = text || detail;
              }
            } catch {
              /* ignore */
            }
            // Los errores NO se cachean (así se puede reintentar)
            throw RiotApiError.fromStatus(res.status, detail);
          }

          return (await res.json()) as T;
        }),
      { maxAttempts: 3, label }
    );

    // 3. Guardar en caché
    cache.set(url, data, ttlMs);
    return data;
  }

  // 1. Obtener Account por Riot ID (GameName + TagLine)
  async getAccountByRiotId(gameName: string, tagLine: string, routing: RegionalRouting = 'americas') {
    const url = `https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
    return this.fetchRiot<{ puuid: string; gameName: string; tagLine: string }>(url, TTL.account);
  }

  // 2. Obtener Summoner por PUUID
  async getSummonerByPuuid(puuid: string, region: RiotRegion = 'la2') {
    const url = `https://${region}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`;
    return this.fetchRiot<{
      id?: string;
      accountId?: string;
      puuid: string;
      profileIconId: number;
      revisionDate: number;
      summonerLevel: number;
    }>(url, TTL.summoner);
  }

  // 3. Rangos (SoloQ / Flex) por PUUID
  async getLeagueEntriesByPuuid(puuid: string, region: RiotRegion = 'la2') {
    const url = `https://${region}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`;
    return this.fetchRiot<Array<{
      leagueId: string;
      queueType: 'RANKED_SOLO_5x5' | 'RANKED_FLEX_SR';
      tier: string;
      rank: string;
      leaguePoints: number;
      wins: number;
      losses: number;
      hotStreak: boolean;
    }>>(url, TTL.league);
  }

  // 4. Rangos por Summoner ID (legacy)
  async getLeagueEntries(summonerId: string, region: RiotRegion = 'la2') {
    const url = `https://${region}.api.riotgames.com/lol/league/v4/entries/by-summoner/${summonerId}`;
    return this.fetchRiot<Array<{
      leagueId: string;
      queueType: 'RANKED_SOLO_5x5' | 'RANKED_FLEX_SR';
      tier: string;
      rank: string;
      leaguePoints: number;
      wins: number;
      losses: number;
      hotStreak: boolean;
    }>>(url, TTL.league);
  }

  // 5. Maestría de campeones
  async getTopMasteries(puuid: string, region: RiotRegion = 'la2', count: number = 3) {
    const url = `https://${region}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/top?count=${count}`;
    return this.fetchRiot<Array<{
      puuid: string;
      championId: number;
      championLevel: number;
      championPoints: number;
      lastPlayTime: number;
    }>>(url, TTL.mastery);
  }

  // 6. Historial de match IDs (opcional: filtrar por cola, ej: 440 = Flex)
  async getMatchIdsByPuuid(
    puuid: string,
    routing: RegionalRouting = 'americas',
    count: number = 20,
    queue?: number
  ) {
    let url = `https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${count}`;
    if (queue) url += `&queue=${queue}`;
    return this.fetchRiot<string[]>(url, TTL.matchIds);
  }

  // 7. Detalle del match (NUNCA cambia una vez terminado -> caché larga)
  async getMatchDetail(matchId: string, routing: RegionalRouting = 'americas') {
    const url = `https://${routing}.api.riotgames.com/lol/match/v5/matches/${matchId}`;
    return this.fetchRiot<any>(url, TTL.matchDetail);
  }

  // 8. Timeline del match (frames por minuto: oro, XP, CS, etc.)
  async getMatchTimeline(matchId: string, routing: RegionalRouting = 'americas') {
    const url = `https://${routing}.api.riotgames.com/lol/match/v5/matches/${matchId}/timeline`;
    return this.fetchRiot<any>(url, TTL.matchDetail);
  }
}
