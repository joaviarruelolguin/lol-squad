import type { MvpEntry, MvpScoreBreakdown, MvpWindow } from './types';

/**
 * MVP Semanal: coronamos al mejor jugador de la squad en una ventana de 7 días.
 *
 * Todo lo de este módulo es puro (sin fetch, sin Supabase) para poder testearlo
 * y para que el endpoint y la UI compartan exactamente los mismos números.
 */

// ============================================================
// Ventana temporal
// ============================================================

export const MVP_WINDOW_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = MVP_WINDOW_DAYS * DAY_MS;

/**
 * Lunes 00:00 (hora local) de la semana que contiene `now`.
 *
 * Anclar a la semana calendario en vez de "rolling 7 días" es lo que hace que el
 * MVP "se renueve": el ganador queda congelado durante la semana y el lunes
 * arranca una Matos جديد. Con ventana rodante el título cambiaría cada vez que
 * alguien juega, y no wouldnía ser un premio sino una foto del momento.
 */
export function startOfWeek(now: number = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0 = domingo ... 6 = sábado
  // El lunes es day 1, así que retrocedemos (1 - dow). Para el domingo (0)
  // eso da -6 días, que es el lunes de la misma semana.
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return d.getTime();
}

/** Ventana de la semana en curso: lunes 00:00 → ahora. */
export function getWeekWindow(now: number = Date.now()): MvpWindow {
  const start = startOfWeek(now);
  const renewsAt = start + WEEK_MS;
  return {
    start,
    end: now,
    renewsAt,
    kind: 'week',
    days: MVP_WINDOW_DAYS,
  };
}

/**
 * Ventana rodante de 7 días hacia atrás.
 *
 * Se usa solo como red de seguridad: si es lunes a la mañana y la squad todavía
 * no jugó nada, la semana calendario estaría vacía y no habría MVP que mostrar.
 */
export function getRollingWindow(now: number = Date.now()): MvpWindow {
  return {
    start: now - WEEK_MS,
    end: now,
    renewsAt: startOfWeek(now) + WEEK_MS,
    kind: 'rolling',
    days: MVP_WINDOW_DAYS,
  };
}

/**
 * ¿Esta ventana tiene material para coronar a alguien?
 *
 * Con menos de 2 partidas los porcentajes son ruido: 1/1 da 100% de winrate y
 * cualquier jugador gana. Preferimos mostrar la ventana rodante antes que
 * coronar un MVP por una sola partida.
 */
export function isUsableWindow(matchesInWindow: number): boolean {
  return matchesInWindow >= 2;
}

// ============================================================
// Puntaje
// ============================================================

/**
 * Referencias de normalización: el valor en el que cada métrica vale el 100%.
 *
 * Son constantes y no "el mejor de la squad" a propósito. Si normalizáramos
 * contra el máximo de la ventana, el ganador siempre sacaría 100 en cada
 * métrica y los puntajes no serían comparables entre semanas (que es justamente
 * lo que sirve para el "vs MVP anterior").
 */
export const MVP_REFERENCE = {
  /** 65% de winrate es una semana excelente. */
  winrate: 65,
  /** KDA 4 en promedio es muy buen desempeño. */
  kda: 4,
  /** 28% del daño del equipo: peso real en carries. */
  damageShare: 28,
  /** 45 de vision score por partida. */
  vision: 45,
  /** Winrate de los últimos 5 juegos al 80%. */
  momentum: 80,
} as const;

/** Peso de cada métrica en el puntaje final. Suman 100. */
export const MVP_WEIGHTS = {
  winrate: 35,
  kda: 25,
  damageShare: 15,
  vision: 10,
  momentum: 15,
} as const;

export interface MvpScoreInput {
  /** Winrate de la ventana, 0-100. */
  winrate: number;
  avgKDA: number;
  /** Porcentaje del daño del equipo, 0-100. */
  damageShare: number;
  avgVision: number;
  /** Winrate de los últimos 5 juegos, 0-100. */
  momentum: number;
}

const clamp01 = (n: number): number => {
  if (!Number.isFinite(n) || n < 0) return 0;
  return n > 1 ? 1 : n;
};

/**
 * Puntaje bruto (0-100) sin ajustar por tamaño de muestra.
 *
 * Cada métrica se divide por su referencia y se recorta a 1, así que nadie
 * puede "ganar" multiplicando una sola estadística: hacer 40/1/20 con 12 kills
 * y 90% de WR es imposible, y el puntaje lo refleja.
 */
export function computeMvpScore(input: MvpScoreInput): MvpScoreBreakdown {
  const parts = {
    winrate: clamp01(input.winrate / MVP_REFERENCE.winrate),
    kda: clamp01(input.avgKDA / MVP_REFERENCE.kda),
    damageShare: clamp01(input.damageShare / MVP_REFERENCE.damageShare),
    vision: clamp01(input.avgVision / MVP_REFERENCE.vision),
    momentum: clamp01(input.momentum / MVP_REFERENCE.momentum),
  };

  const weighted = {
    winrate: parts.winrate * MVP_WEIGHTS.winrate,
    kda: parts.kda * MVP_WEIGHTS.kda,
    damageShare: parts.damageShare * MVP_WEIGHTS.damageShare,
    vision: parts.vision * MVP_WEIGHTS.vision,
    momentum: parts.momentum * MVP_WEIGHTS.momentum,
  };

  const raw =
    weighted.winrate +
    weighted.kda +
    weighted.damageShare +
    weighted.vision +
    weighted.momentum;

  return {
    raw: round1(raw),
    parts: {
      winrate: round1(weighted.winrate),
      kda: round1(weighted.kda),
      damageShare: round1(weighted.damageShare),
      vision: round1(weighted.vision),
      momentum: round1(weighted.momentum),
    },
  };
}

/**
 * Cuánto pesa el jugador en el puntaje según cuántas partidas jugó.
 *
 * games/(games+3): con 1 partida pesa 0.25, con 3 → 0.5, con 6 → 0.67, con 15
 * → 0.83. Es un encogimiento hacia la media de la squad: frena el 1/1 que
 * "gana" con 100% de winrate sin llegar a dejarlo fuera de la pelea.
 */
export function confidenceWeight(games: number): number {
  if (games <= 0) return 0;
  return games / (games + 3);
}

/**
 * Ajusta el puntaje bruto por tamaño de muestra, acercándolo a la media de la
 * squad en proporción a lo poco que Meyer jogó.
 */
export function applyConfidence(
  raw: number,
  games: number,
  squadAverage: number
): number {
  const w = confidenceWeight(games);
  return round1(squadAverage * (1 - w) + raw * w);
}

/** Con menos de 3 partidas el título es estadísticamente flojo: lo avisamos en la UI. */
export function isLowSample(games: number): boolean {
  return games < 3;
}

// ============================================================
// Agregación de partidas
// ============================================================

/** Datos crudos de un match-v5, recortados a lo que el MVP necesita. */
export interface MvpMatchLike {
  info?: {
    gameCreation?: number;
    gameDuration?: number;
    participants?: Array<{
      puuid: string;
      win?: boolean;
      kills?: number;
      deaths?: number;
      assists?: number;
      championName?: string;
      championId?: number;
      totalDamageDealtToChampions?: number;
      visionScore?: number;
      totalMinionsKilled?: number;
      neutralMinionsKilled?: number;
      wardsPlaced?: number;
      teamId?: number;
    }>;
  } | null;
}

export interface MvpMemberLike {
  id: string;
  puuid: string;
  gameName: string;
  nickname: string;
  profileIconId?: number;
  role?: string;
}

interface Accumulator {
  member: MvpMemberLike;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  vision: number;
  cs: number;
  wards: number;
  damageShare: number;
  /** { created, win } en orden cronológico, para racha y últimos 5. */
  timeline: { created: number; win: boolean }[];
  champions: Map<string, { games: number; wins: number }>;
}

export interface MvpAggregateResult {
  entries: MvpEntry[];
  /** Partidas de la ventana donde hubo al menos un miembro de la squad. */
  matchesInWindow: number;
  /** Suma de partidas-individuales de toda la squad. */
  totalPlayerGames: number;
  squadWins: number;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Corone el MVP de la ventana.
 *
 * Recorre las partidas una sola vez y arma un acumulador por jugador. Todas las
 * métricas salen de ese único pase, así que agregar el MVP no cuesta una request
 * extra: las partidas ya están en `match_cache`.
 */
export function computeMvp(
  matches: MvpMatchLike[],
  members: MvpMemberLike[],
  window: MvpWindow
): MvpAggregateResult {
  const byPuuid = new Map<string, Accumulator>();
  const accumulators = new Map<string, Accumulator>();

  for (const member of members) {
    if (!member.puuid) continue;
    const acc: Accumulator = {
      member,
      games: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      damage: 0,
      vision: 0,
      cs: 0,
      wards: 0,
      damageShare: 0,
      timeline: [],
      champions: new Map(),
    };
    byPuuid.set(member.puuid, acc);
    accumulators.set(member.id, acc);
  }

  let matchesInWindow = 0;

  for (const match of matches) {
    const info = match?.info;
    if (!info || !Array.isArray(info.participants)) continue;

    const created = info.gameCreation ?? 0;
    if (created < window.start || created > window.end) continue;

    const squadParticipants = info.participants.filter((p) => byPuuid.has(p.puuid));
    if (squadParticipants.length === 0) continue;

    matchesInWindow++;

    // Daño total por equipo, para el damage share.
    const teamDamage = new Map<number, number>();
    for (const p of info.participants) {
      const team = p.teamId ?? 0;
      teamDamage.set(team, (teamDamage.get(team) ?? 0) + (p.totalDamageDealtToChampions ?? 0));
    }

    for (const p of squadParticipants) {
      const acc = byPuuid.get(p.puuid)!;
      const win = Boolean(p.win);

      acc.games++;
      if (win) acc.wins++;
      acc.kills += p.kills ?? 0;
      acc.deaths += p.deaths ?? 0;
      acc.assists += p.assists ?? 0;
      acc.damage += p.totalDamageDealtToChampions ?? 0;
      acc.vision += p.visionScore ?? 0;
      acc.cs += (p.totalMinionsKilled ?? 0) + (p.neutralMinionsKilled ?? 0);
      acc.wards += p.wardsPlaced ?? 0;

      const teamTotal = teamDamage.get(p.teamId ?? 0) ?? 0;
      if (teamTotal > 0) {
        acc.damageShare += ((p.totalDamageDealtToChampions ?? 0) / teamTotal) * 100;
      }

      acc.timeline.push({ created, win });

      const champName = p.championName || `Champ #${p.championId ?? 0}`;
      const champ = acc.champions.get(champName) ?? { games: 0, wins: 0 };
      champ.games++;
      if (win) champ.wins++;
      acc.champions.set(champName, champ);
    }
  }

  // --- Puntaje bruto de cada uno ---
  const raws = new Map<string, number>();
  const partials: {
    acc: Accumulator;
    score: MvpScoreInput;
    breakdown: MvpScoreBreakdown;
  }[] = [];

  for (const acc of accumulators.values()) {
    if (acc.games === 0) continue;

    const g = acc.games;
    const winrate = (acc.wins / g) * 100;
    const avgKDA = acc.deaths === 0 ? acc.kills + acc.assists : (acc.kills + acc.assists) / acc.deaths;
    const score: MvpScoreInput = {
      winrate,
      avgKDA,
      damageShare: acc.damageShare / g,
      avgVision: acc.vision / g,
      momentum: recentWinrate(acc.timeline, 5),
    };

    const breakdown = computeMvpScore(score);
    raws.set(acc.member.id, breakdown.raw);
    partials.push({ acc, score, breakdown });
  }

  // Media de puntajes crudos: es a lo que se encoge cuando hay poca muestra.
  const rawList = [...raws.values()];
  const squadAverage =
    rawList.length > 0
      ? rawList.reduce((s, n) => s + n, 0) / rawList.length
      : 0;

  // --- Armar la tabla final ---
  const entries: MvpEntry[] = partials.map(({ acc, breakdown }) => {
    const g = acc.games;
    const streak = currentStreak(acc.timeline);
    const champion = topChampion(acc.champions);

    return {
      memberId: acc.member.id,
      gameName: acc.member.gameName,
      nickname: acc.member.nickname,
      profileIconId: acc.member.profileIconId ?? 29,
      role: acc.member.role ?? 'FILL',
      games: g,
      wins: acc.wins,
      losses: g - acc.wins,
      winrate: Math.round((acc.wins / g) * 100),
      avgKills: round1(acc.kills / g),
      avgDeaths: round1(acc.deaths / g),
      avgAssists: round1(acc.assists / g),
      avgKDA: Math.round(avgKDAOf(acc) * 100) / 100,
      avgDamage: Math.round(acc.damage / g),
      avgVision: Math.round(acc.vision / g),
      avgCS: round1(acc.cs / g),
      wardsPlaced: Math.round(acc.wards / g),
      damageShare: round1(acc.damageShare / g),
      streak,
      lastResults: acc.timeline
        .slice(-5)
        .sort((a, b) => a.created - b.created)
        .map((t) => t.win),
      champion,
      score: applyConfidence(breakdown.raw, g, squadAverage),
      scoreBreakdown: breakdown,
      confidence: round1(confidenceWeight(g) * 100),
      lowSample: isLowSample(g),
    };
  });

  entries.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Empate exacto: gana el que más partidas tiene (más evidencia) y, si
    // tampoco empatan, el KDA. El título tiene que ser determinístico.
    if (b.games !== a.games) return b.games - a.games;
    return b.avgKDA - a.avgKDA;
  });

  const totalPlayerGames = entries.reduce((s, e) => s + e.games, 0);
  const squadWins = entries.reduce((s, e) => s + e.wins, 0);

  return { entries, matchesInWindow, totalPlayerGames, squadWins };
}

function avgKDAOf(acc: Accumulator): number {
  return acc.deaths === 0
    ? acc.kills + acc.assists
    : (acc.kills + acc.assists) / acc.deaths;
}

/** Winrate de los últimos N juegos (timeline en orden cronológico). */
export function recentWinrate(
  timeline: { created: number; win: boolean }[],
  n: number
): number {
  if (timeline.length === 0) return 0;
  const recent = [...timeline].sort((a, b) => a.created - b.created).slice(-n);
  const wins = recent.filter((t) => t.win).length;
  return (wins / recent.length) * 100;
}

/** Racha actual: tipo y cantidad. Con la más larga reciente va primero. */
export function currentStreak(
  timeline: { created: number; win: boolean }[]
): { type: 'win' | 'loss' | null; length: number } {
  if (timeline.length === 0) return { type: null, length: 0 };

  const ordered = [...timeline].sort((a, b) => a.created - b.created);
  const last = ordered[ordered.length - 1].win ? 'win' : 'loss';

  let length = 0;
  for (let i = ordered.length - 1; i >= 0; i--) {
    const isWin = ordered[i].win;
    if ((isWin ? 'win' : 'loss') !== last) break;
    length++;
  }

  return { type: last, length };
}

function topChampion(
  champions: Map<string, { games: number; wins: number }>
): MvpEntry['champion'] {
  let best: { name: string; games: number; wins: number } | null = null;
  for (const [name, data] of champions) {
    if (!best || data.games > best.games) best = { name, ...data };
  }
  if (!best) return null;
  return {
    name: best.name,
    games: best.games,
    wins: best.wins,
    winrate: Math.round((best.wins / best.games) * 100),
  };
}

/** Etiqueta corta para el tipo de racha, en español. */
export function streakLabel(streak: MvpEntry['streak']): string {
  if (!streak.type || streak.length === 0) return '—';
  const n = streak.length;
  const noun = n === 1 ? 'partida' : 'partidas';
  return streak.type === 'win' ? `${n} ${noun} ganando` : `${n} ${noun} perdiendo`;
}
