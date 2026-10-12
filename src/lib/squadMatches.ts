import { getSquadMembers } from './storage';
import { RiotApiClient, getRegionalRouting } from './riot';
import { getMatchesWithCache } from './matchCache';
import { SimpleCache } from './cache';
import { ErrorInfo } from './errors';
import type { SquadMember } from './types';

/**
 * Conjunto de partidas de la squad, normalizado y compartido.
 *
 * Siete endpoints (duos, trios, composition, trends, player-stats,
 * player-metrics, weekly) piden exactamente el mismo historial Flex de los
 * mismos miembros. Antes cada uno:
 *
 * 1. Pegaba sus N requests de match IDs (secuenciales, uno por miembro).
 * 2. Hacía su propio `SELECT ... IN` sobre match_cache.
 * 3. JSON.parseaba los mismos ~100 objetos de partida, de 100 a 500 KB cada uno.
 * 4. Recorría los mismos participantes para agregar SU métrica.
 *
 * Abrir la pestaña Sinergia monta TrendsPanel, TrioPanel y CompositionPanel a la
 * vez, así que eso pasaba tres veces en paralelo, más el `/api/duos` de la carga
 * inicial.
 *
 * Acá queda en un solo lugar: los pedidos a Riot, la lectura de match_cache y el
 * parseo se hacen una vez y se reusan. Cada endpoint sigue haciendo su propia
 * agregación (que es lo que realmente distingue a uno de otro) sobre el mismo
 * array ya normalizado.
 */

/** Participante de una partida, con solo los campos que la app usa. */
export interface SquadParticipant {
  puuid: string;
  /**
   * participantId de Riot (suele venir 1-based).
   *
   * Lo conservamos porque el timeline usa esta convención mientras que el
   * detalle de partida a veces viene con índice+1. /api/trends resuelve el
   *Victim de cada muerte con los dos mapas, así que necesita el valor real.
   */
  participantId?: number;
  riotIdGameName: string;
  riotIdTagline: string;
  squadMemberId?: string;
  squadNickname?: string;
  championId: number;
  championName: string;
  teamId: number;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  totalDamageDealtToChampions: number;
  physicalDamage: number;
  magicDamage: number;
  trueDamage: number;
  totalDamageTaken: number;
  goldEarned: number;
  /** Miniones de lane + camp. El jungler saca la mayoría de su CS de los camp. */
  cs: number;
  visionScore: number;
  wardsPlaced: number;
  wardsKilled: number;
  damageDealtToObjectives: number;
  role: string;
  lane: string;
}

export interface SquadMatch {
  matchId: string;
  /** Epoch en ms de la creación de la partida. */
  created: number;
  duration: number;
  queueId: number;
  gameVersion: string;
  participants: SquadParticipant[];
  /** Solo los participantes que pertenecen a la squad. */
  squadParticipants: SquadParticipant[];
  /** Daño total por teamId, base para calcular el damage share. */
  teamDamage: Map<number, number>;
}

export interface SquadMatchSet {
  matches: SquadMatch[];
  /** Cuántas partidas hubo en total (incluidas las que no llegamos a bajar). */
  candidateCount: number;
  errors: ErrorInfo[];
  members: SquadMember[];
  puuidToMember: Map<string, SquadMember>;
  /** Miembros de la squad que jugaron cada partida, contados. Por matchId. */
  squadCountByMatch: Map<string, number>;
}

export interface SquadMatchOptions {
  /** Cuántas partidas mirar por jugador. */
  matchesPerPlayer?: number;
  /** Cola de Riot (440 = Flex). `undefined` = todas. */
  queue?: number;
  /** Descartar partidas anteriores a este epoch (ms). */
  since?: number;
  /** Exigir al menos N miembros de la squad por partida. */
  minSquadMembers?: number;
  /** Pedir también el timeline (lo necesita /api/trends para los minutos de muerte). */
  withTimeline?: boolean;
  /** TTL de la caché en memoria del resultado normalizado. */
  cacheMs?: number;
}

const DEFAULTS = {
  matchesPerPlayer: 20,
  queue: 440,
  minSquadMembers: 1,
  cacheMs: 10 * 60 * 1000,
};

/**
 * TTL corto a propósito: las partidas no cambian (el detalle tiene 24h de caché),
 * pero losjugadores suman partidas nuevas. 10 minutos es un buen balance entre
 * no recalcular y que una partida nueva no tarde media hora en aparecer.
 */
const resultCache = new SimpleCache<SquadMatchSet>(DEFAULTS.cacheMs);

/** Normaliza los datos crudos de match-v5 a lo que la app usa. */
function normalizeMatch(
  matchId: string,
  info: any,
  puuidToMember: Map<string, SquadMember>
): SquadMatch | null {
  if (!info || !Array.isArray(info.participants) || info.participants.length === 0) {
    return null;
  }

  const participants: SquadParticipant[] = info.participants.map((p: any) => {
    const squadMember = puuidToMember.get(p.puuid);
    return {
      puuid: p.puuid,
      participantId: typeof p.participantId === 'number' ? p.participantId : undefined,
      riotIdGameName: p.riotIdGameName || 'Desconocido',
      riotIdTagline: p.riotIdTagline || '',
      squadMemberId: squadMember?.id,
      squadNickname: squadMember?.nickname,
      championId: p.championId,
      championName: p.championName || 'Unknown',
      teamId: p.teamId,
      win: Boolean(p.win),
      kills: p.kills || 0,
      deaths: p.deaths || 0,
      assists: p.assists || 0,
      totalDamageDealtToChampions: p.totalDamageDealtToChampions || 0,
      physicalDamage: p.physicalDamageDealtToChampions || 0,
      magicDamage: p.magicDamageDealt || 0,
      trueDamage: p.trueDamageDealt || 0,
      totalDamageTaken: p.totalDamageTaken || 0,
      goldEarned: p.goldEarned || 0,
      // El CS de jungla viene de los camp (neutralMinionsKilled). Sin esto los
      // jungleres figuraban con su CS de lane nomás (tipo 33 en vez de 150+).
      cs: (p.totalMinionsKilled || 0) + (p.neutralMinionsKilled || 0),
      visionScore: p.visionScore || 0,
      wardsPlaced: p.wardsPlaced || 0,
      wardsKilled: p.wardsKilled || 0,
      damageDealtToObjectives: p.damageDealtToObjectives || 0,
      role: p.role || 'NONE',
      lane: p.lane || 'NONE',
    };
  });

  const teamDamage = new Map<number, number>();
  for (const p of participants) {
    teamDamage.set(p.teamId, (teamDamage.get(p.teamId) ?? 0) + p.totalDamageDealtToChampions);
  }

  return {
    matchId,
    created: info.gameCreation || 0,
    duration: info.gameDuration || 0,
    queueId: info.queueId,
    gameVersion: info.gameVersion || '',
    participants,
    squadParticipants: participants.filter((p) => p.squadMemberId),
    teamDamage,
  };
}

/**
 * Historial Flex de la squad, listo para agregar.
 *
 * Devuelve el mismo objeto (con los mismos Map) para llamadas equivalentes
 * dentro del TTL, así que el que(cachea?) tiene que tratarlo como solo lectura.
 */
export async function getSquadMatchSet(
  options: SquadMatchOptions = {}
): Promise<SquadMatchSet> {
  const matchesPerPlayer = options.matchesPerPlayer ?? DEFAULTS.matchesPerPlayer;
  const queue = options.queue ?? DEFAULTS.queue;
  const minSquad = options.minSquadMembers ?? DEFAULTS.minSquadMembers;
  const withTimeline = options.withTimeline ?? false;
  const cacheMs = options.cacheMs ?? DEFAULTS.cacheMs;

  const cacheKey = [
    matchesPerPlayer,
    queue,
    minSquad,
    withTimeline,
    options.since ?? 0,
  ].join(':');

  const cached = resultCache.get(cacheKey);
  if (cached) return cached;

  const allMembers = await getSquadMembers();
  const members = allMembers.filter(
    (m): m is SquadMember & { puuid: string } => Boolean(m.puuid)
  );
  const errors: ErrorInfo[] = [];

  if (members.length === 0) {
    const empty: SquadMatchSet = {
      matches: [],
      candidateCount: 0,
      errors,
      members,
      puuidToMember: new Map(),
      squadCountByMatch: new Map(),
    };
    resultCache.set(cacheKey, empty, cacheMs);
    return empty;
  }

  const puuidToMember = new Map<string, SquadMember>(members.map((m) => [m.puuid, m]));

  // --- 1. Match IDs de todos, en paralelo ---
  //
  // En serie serían N esperas encadenadas al rate limiter global (2 req/s) sin
  // solapar nada. El limiter sigue soltando 2 por segundo: no cambia la cuota,
  // solo deja de acumularse la latencia.
  const client = new RiotApiClient();
  const idResults = await Promise.allSettled(
    members.map((member) =>
      client.getMatchIdsByPuuid(
        member.puuid,
        getRegionalRouting(member.region),
        matchesPerPlayer,
        queue
      )
    )
  );

  // Cuántos de la squad vio cada lista, para no perder partidas si un
  // historial falla.
  const squadCountByMatch = new Map<string, number>();
  const orderedMatchIds: string[] = [];
  const seen = new Set<string>();

  idResults.forEach((res, i) => {
    if (res.status === 'rejected') {
      errors.push({
        type: 'NETWORK_ERROR',
        message: `No se pudo leer el historial de ${members[i].gameName}.`,
        detail:
          res.reason instanceof Error ? res.reason.message : String(res.reason),
      });
      return;
    }
    for (const id of res.value) {
      const isNew = !seen.has(id);
      if (isNew) {
        seen.add(id);
        orderedMatchIds.push(id);
      }
      if (isNew) squadCountByMatch.set(id, 1);
      else squadCountByMatch.set(id, (squadCountByMatch.get(id) ?? 1) + 1);
    }
  });

  // --- 2. Filtros baratos, antes de bajar cualquier detalle ---
  let candidateIds = orderedMatchIds;

  if (minSquad > 1) {
    candidateIds = candidateIds.filter((id) => (squadCountByMatch.get(id) ?? 0) >= minSquad);
  }

  // --- 3. Detalles por la caché persistente ---
  const routing = getRegionalRouting(members[0].region);
  const raw = candidateIds.length
    ? await getMatchesWithCache(candidateIds, routing, withTimeline)
    : [];

  // --- 4. Normalizar y filtrar por fecha (esta sí necesita el detalle) ---
  const matches: SquadMatch[] = [];
  for (const { matchId, info } of raw) {
    const normalized = normalizeMatch(matchId, info, puuidToMember);
    if (!normalized) continue;
    if (options.since !== undefined && normalized.created < options.since) continue;
    matches.push(normalized);
  }

  const result: SquadMatchSet = {
    matches,
    candidateCount: orderedMatchIds.length,
    errors,
    members,
    puuidToMember,
    squadCountByMatch,
  };

  resultCache.set(cacheKey, result, cacheMs);
  return result;
}

/** Vacía el caché normalizado. Lo usa el botón "Forzar" del cliente. */
export function clearSquadMatchCache(): void {
  resultCache.clear();
}
