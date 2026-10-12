import { NextResponse } from 'next/server';
import { connection } from 'next/server';
import { SquadMember, TrendResult, PlayerTrend } from '@/lib/types';
import { getSquadMatchSet } from '@/lib/squadMatches';
import { getMatchesWithCache } from '@/lib/matchCache';
import { getRegionalRouting } from '@/lib/riot';
import { guardRead } from '@/lib/rateLimit';

const MATCHES_PER_PLAYER = 20;
const FLEX_QUEUE = 440;
const MIN_TREND_GAMES = 5;

/**
 * Cuántas partidas pedir timeline.
 *
 * El timeline es un request extra por partida y solo lo usan los minutos de
 * muerte. Pedirlo para las ~100 partidas del historial sonaba a +100 requests que
 * ningún otro endpoint aprovecha. Con las 20 más recientes hay muestra de sobra
 * para detectar en qué franja del juego se efectúan las muertes.
 */
const TIMELINE_LIMIT = 20;

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

interface Agg {
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  vision: number;
  cs: number;
  csMinutes: number;
  deathMinutes: number[];
  deathsByHour: number[];
  gamesByHour: number[];
  deathsByDay: number[];
  gamesByDay: number[];
  results: { created: number; won: boolean }[];
}

function newAgg(): Agg {
  return {
    games: 0, wins: 0, kills: 0, deaths: 0, assists: 0, damage: 0, vision: 0, cs: 0, csMinutes: 0,
    deathMinutes: [],
    deathsByHour: new Array(24).fill(0),
    gamesByHour: new Array(24).fill(0),
    deathsByDay: new Array(7).fill(0),
    gamesByDay: new Array(7).fill(0),
    results: [],
  };
}

export async function GET(req: Request) {
  await connection();

  const limited = guardRead(req, 'trends');
  if (limited) return limited;

  // Historial Flex de la squad, compartido con duos, trios, composition y
  // player-metrics: los pedidos a Riot, el SELECT sobre match_cache y el parseo
  // de las partidas se hacen una sola vez.
  const squad = await getSquadMatchSet({
    matchesPerPlayer: MATCHES_PER_PLAYER,
    queue: FLEX_QUEUE,
  });
  const { members } = squad;

  if (members.length === 0) {
    return NextResponse.json({
      status: 'error' as const,
      error: 'No hay miembros en la squad.',
      trends: [],
      scannedMatches: 0,
    } as TrendResult);
  }

  const puuidToMember = squad.puuidToMember;

  const aggs = new Map<string, Agg>();
  const getAgg = (id: string): Agg => {
    if (!aggs.has(id)) aggs.set(id, newAgg());
    return aggs.get(id)!;
  };

  let scannedMatches = 0;

  // Timeline solo para las partidas más recientes (ver TIMELINE_LIMIT).
  const recentIds = squad.matches
    .slice(0, TIMELINE_LIMIT)
    .map((m) => m.matchId);
  const timelineByMatch = new Map<string, any>();
  if (recentIds.length > 0) {
    const withTimeline = await getMatchesWithCache(
      recentIds,
      getRegionalRouting(members[0].region),
      true
    );
    for (const { matchId, timeline } of withTimeline) {
      if (timeline) timelineByMatch.set(matchId, timeline);
    }
  }

  for (const match of squad.matches) {
    if (match.squadParticipants.length === 0) continue;
    scannedMatches++;

    const durationMin = match.duration / 60;
    const hour = new Date(match.created).getHours();
    const dayOfWeek = new Date(match.created).getDay();

    for (const p of match.squadParticipants) {
      const agg = getAgg(p.squadMemberId!);
      agg.games++;
      if (p.win) agg.wins++;
      agg.kills += p.kills;
      agg.deaths += p.deaths;
      agg.assists += p.assists;
      agg.damage += p.totalDamageDealtToChampions;
      agg.vision += p.visionScore;
      agg.cs += p.cs;
      if (durationMin > 0) agg.csMinutes += p.cs / durationMin;
      agg.deathsByHour[hour] += p.deaths;
      agg.gamesByHour[hour]++;
      agg.deathsByDay[dayOfWeek] += p.deaths;
      agg.gamesByDay[dayOfWeek]++;
      agg.results.push({ created: match.created, won: p.win });
    }

    // Timeline para minutos exactos de muerte
    try {
      const timeline = timelineByMatch.get(match.matchId);
      const frames = timeline?.info?.frames || [];
      if (frames.length === 0) continue;

      // Mapear participantId -> miembro. Riot usa dos convenciones:
      //  - match detail: participantId explicito (suele venir 1-based)
      //  - timeline: puede usar el indice+1
      // Construimos ambos mapas y usamos el que coincida, sin doble conteo.
      const mapByField = new Map<number, SquadMember>();
      const mapByIndex = new Map<number, SquadMember>();
      match.participants.forEach((p, idx) => {
        const m = puuidToMember.get(p.puuid);
        if (!m) return;
        if (typeof p.participantId === 'number') mapByField.set(p.participantId, m);
        mapByIndex.set(idx + 1, m);
      });
      const resolveMember = (pid: number): SquadMember | undefined =>
        mapByField.get(pid) ?? mapByIndex.get(pid);

      for (const frame of frames) {
        for (const ev of frame?.events || []) {
          // Formato nuevo (dataVersion 2): type === CHAMPION_KILL. La victima
          // se deduce de victimDamageDealt[].participantId.
          if (ev.type === 'CHAMPION_KILL') {
            const victimPids = new Set<number>();
            for (const d of ev.victimDamageDealt || []) {
              if (typeof d.participantId === 'number') victimPids.add(d.participantId);
            }
            for (const pid of victimPids) {
              const m = resolveMember(pid);
              if (!m) continue;
              getAgg(m.id).deathMinutes.push(
                Math.round((ev.timestamp ?? frame.timestamp) / 60000)
              );
            }
            continue;
          }

          // Formato legacy: EventType === Death
          if (ev.EventType === 'Death') {
            const pid = ev.participantId;
            if (!pid) continue;
            const m = resolveMember(pid);
            if (!m) continue;
            getAgg(m.id).deathMinutes.push(
              Math.round((ev.timestamp ?? frame.timestamp) / 60000)
            );
          }
        }
      }
    } catch {
      // timeline no disponible
    }
  }

  // Construir tendencias
  const trends: PlayerTrend[] = [];

  for (const member of members) {
    const a = aggs.get(member.id);
    if (!a || a.games === 0) continue;

    const g = a.games;
    const winrate = Math.round((a.wins / g) * 100);

    // Ventana de 5 minutos con más muertes
    let worstDeathWindow = '';
    if (a.deathMinutes.length >= 5) {
      const buckets = new Array(41).fill(0);
      for (const m of a.deathMinutes) buckets[Math.min(40, Math.max(0, m))]++;
      let best = { start: 0, count: 0 };
      for (let s = 0; s <= 35; s++) {
        const count = buckets.slice(s, s + 5).reduce((x, n) => x + n, 0);
        if (count > best.count) best = { start: s, count };
      }
      if (best.count >= 3) worstDeathWindow = `${best.start}-${best.start + 5}`;
    }

    // Hora más mortal
    let worstHour: PlayerTrend['worstHour'] = null;
    for (let h = 0; h < 24; h++) {
      if (a.gamesByHour[h] < 2) continue;
      const dpg = a.deathsByHour[h] / a.gamesByHour[h];
      if (!worstHour || dpg > worstHour.deathsPerGame) {
        worstHour = { hour: h, deathsPerGame: Math.round(dpg * 10) / 10, games: a.gamesByHour[h] };
      }
    }

    // Día más mortal
    let worstDay: PlayerTrend['worstDay'] = null;
    for (let d = 0; d < 7; d++) {
      if (a.gamesByDay[d] < 2) continue;
      const dpg = a.deathsByDay[d] / a.gamesByDay[d];
      if (!worstDay || dpg > worstDay.deathsPerGame) {
        worstDay = {
          day: d, name: DAY_NAMES[d],
          deathsPerGame: Math.round(dpg * 10) / 10, games: a.gamesByDay[d],
        };
      }
    }

    // Últimos 10 resultados en orden cronológico (oldest → newest)
    const sorted = [...a.results].sort((x, y) => x.created - y.created);
    const last10 = sorted.slice(-10).map((r) => r.won);

    // Racha actual
    let streakType: 'win' | 'loss' | null = null;
    let streakLength = 0;
    for (let i = sorted.length - 1; i >= 0; i--) {
      const won = sorted[i].won;
      if (streakType === null) streakType = won ? 'win' : 'loss';
      if ((won ? 'win' : 'loss') !== streakType) break;
      streakLength++;
    }

    trends.push({
      memberId: member.id,
      gameName: member.gameName,
      nickname: member.nickname,
      profileIconId: member.profileIconId || 29,
      games: g,
      wins: a.wins,
      losses: g - a.wins,
      winrate,
      avgKills: Math.round((a.kills / g) * 10) / 10,
      avgDeaths: Math.round((a.deaths / g) * 10) / 10,
      avgAssists: Math.round((a.assists / g) * 10) / 10,
      avgDamage: Math.round(a.damage / g),
      avgVision: Math.round(a.vision / g),
      csPerMinute: Math.round((a.csMinutes / g) * 10) / 10,
      hasEnoughData: g >= MIN_TREND_GAMES,
      worstDeathWindow,
      worstHour,
      worstDay,
      last10Results: last10,
      currentStreakType: streakType,
      currentStreakLength: streakLength,
    });
  }

  trends.sort((a, b) => b.winrate - a.winrate);

  return NextResponse.json({
    status: 'ok' as const,
    trends,
    scannedMatches,
    minTrendGames: MIN_TREND_GAMES,
  } as TrendResult);
}