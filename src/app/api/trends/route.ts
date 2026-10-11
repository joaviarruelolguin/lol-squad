import { NextResponse } from 'next/server';
import { connection } from 'next/server';
import { getSquadMembers } from '@/lib/storage';
import { RiotApiClient, getRegionalRouting } from '@/lib/riot';
import { getMatchesWithCache } from '@/lib/matchCache';
import { SquadMember, TrendResult, PlayerTrend } from '@/lib/types';

const MATCHES_PER_PLAYER = 20;
const FLEX_QUEUE = 440;
const MIN_TREND_GAMES = 5;

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

export async function GET() {
  await connection();

  const allMembers = await getSquadMembers();
  const members = allMembers.filter(
    (m): m is SquadMember & { puuid: string } => Boolean(m.puuid)
  );

  if (members.length === 0) {
    return NextResponse.json({
      status: 'error' as const,
      error: 'No hay miembros en la squad.',
      trends: [],
      scannedMatches: 0,
    } as TrendResult);
  }

  const client = new RiotApiClient();
  const puuidToMember = new Map<string, SquadMember>(members.map((m) => [m.puuid, m]));

  // Recolectar matchIds
  const orderedMatchIds: string[] = [];
  const seen = new Set<string>();
  for (const member of members) {
    try {
      const routing = getRegionalRouting(member.region);
      const ids = await client.getMatchIdsByPuuid(
        member.puuid, routing, MATCHES_PER_PLAYER, FLEX_QUEUE
      );
      for (const id of ids) {
        if (!seen.has(id)) { seen.add(id); orderedMatchIds.push(id); }
      }
    } catch { /* ignorar */ }
  }

  const defaultRouting = getRegionalRouting(members[0]?.region ?? 'la2');
  const aggs = new Map<string, Agg>();
  const getAgg = (id: string): Agg => {
    if (!aggs.has(id)) aggs.set(id, newAgg());
    return aggs.get(id)!;
  };

  let scannedMatches = 0;

  // Traer todas las partidas con caché persistente: solo va a Riot las nuevas
  const cachedMatches = await getMatchesWithCache(orderedMatchIds, defaultRouting, true, 3);

  for (const { info, timeline } of cachedMatches) {
    if (!info || !Array.isArray(info.participants)) continue;

    const squadPlayers = info.participants.filter((p: any) => puuidToMember.has(p.puuid));
    if (squadPlayers.length === 0) continue;
    scannedMatches++;

    const created = info.gameCreation || 0;
    const durationMin = (info.gameDuration || 0) / 60000;
    const hour = new Date(created).getHours();
    const dayOfWeek = new Date(created).getDay();

    for (const p of squadPlayers) {
      const member = puuidToMember.get(p.puuid)!;
      const a = getAgg(member.id);
      a.games++;
      if (p.win) a.wins++;
      a.kills += p.kills || 0;
      a.deaths += p.deaths || 0;
      a.assists += p.assists || 0;
      a.damage += p.totalDamageDealtToChampions || 0;
      a.vision += p.visionScore || 0;
      const cs = (p.totalMinionsKilled || 0) + (p.neutralMinionsKilled || 0);
      a.cs += cs;
      if (durationMin > 0) a.csMinutes += cs / durationMin;
      a.deathsByHour[hour] += p.deaths || 0;
      a.gamesByHour[hour]++;
      a.deathsByDay[dayOfWeek] += p.deaths || 0;
      a.gamesByDay[dayOfWeek]++;
      a.results.push({ created, won: Boolean(p.win) });
    }

    // Timeline para minutos exactos de muerte (viene del caché)
    try {
      const frames = timeline?.info?.frames || [];
      if (frames.length === 0) continue;

      const pidToMember = new Map<number, SquadMember>();
      info.participants.forEach((p: any, idx: number) => {
        const m = puuidToMember.get(p.puuid);
        if (m) pidToMember.set(idx + 1, m);
      });

      for (const frame of frames) {
        for (const ev of frame?.events || []) {
          if (ev.EventType !== 'Death') continue;
          // En eventos Death, el participantId es el quemurió
          const pid = ev.participantId;
          if (!pid) continue;
          const m = pidToMember.get(pid);
          if (!m) continue;
          getAgg(m.id).deathMinutes.push(Math.round(frame.timestamp / 60000));
        }
      }
    } catch { /* timeline no disponible */ }
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