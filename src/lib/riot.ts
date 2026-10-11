import { RiotRegion, RegionalRouting } from './types';
import { RiotApiError, ErrorInfo } from './errors';
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

    // 2. Consultar Riot
    let res: Response;
    try {
      const token = await this.getApiKey();
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

    const data = (await res.json()) as T;

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
}
