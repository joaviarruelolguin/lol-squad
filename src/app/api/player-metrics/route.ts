import { NextResponse } from 'next/server';
import { connection } from 'next/server';
import { ErrorInfo } from '@/lib/errors';
import { PlayerMetrics, PlayerMetricsResult } from '@/lib/types';
import { getSquadMatchSet } from '@/lib/squadMatches';
import { guardRead } from '@/lib/rateLimit';

const FLEX_QUEUE = 440;
const MATCHES_PER_PLAYER = 20;

export async function GET(req: Request) {
  await connection();

  const limited = guardRead(req, 'player-metrics');
  if (limited) return limited;

  // El historial Flex de la squad es el mismo dataset que usan duos, trios,
  // composition y trends: pedirlo por acá los comparte en vez de repetir los
  // pedidos a Riot, el SELECT sobre match_cache y el parseo de ~100 partidas.
  const { matches, errors, members } = await getSquadMatchSet({
    matchesPerPlayer: MATCHES_PER_PLAYER,
    queue: FLEX_QUEUE,
  });

  if (members.length === 0) {
    return NextResponse.json({
      status: 'error' as const,
      errors: [
        {
          type: 'NOT_FOUND' as const,
          message: 'No hay miembros en la squad para calcular métricas.',
        },
      ],
      metrics: [],
      totalMatchesAnalyzed: 0,
    } as PlayerMetricsResult);
  }

  // --- Agregadores por miembro ---
  interface Agg {
    games: number;
    wins: number;
    kills: number;
    deaths: number;
    assists: number;
    damage: number;
    vision: number;
    cs: number;
    gold: number;
    damageShare: number;
    visionPerMinute: number;
    champions: Map<string, { games: number; wins: number }>;
  }

  const aggs = new Map<string, Agg>();
  const getAgg = (memberId: string): Agg => {
    if (!aggs.has(memberId)) {
      aggs.set(memberId, {
        games: 0,
        wins: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        damage: 0,
        vision: 0,
        cs: 0,
        gold: 0,
        damageShare: 0,
        visionPerMinute: 0,
        champions: new Map(),
      });
    }
    return aggs.get(memberId)!;
  };

  let totalMatchesAnalyzed = 0;

  for (const match of matches) {
    if (match.squadParticipants.length === 0) continue;
    totalMatchesAnalyzed++;

    const durationMin = match.duration / 60;

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
      agg.gold += p.goldEarned;

      // Damage share y vision por minuto
      const teamTotal = match.teamDamage.get(p.teamId) || 1;
      agg.damageShare += p.totalDamageDealtToChampions / teamTotal;
      agg.visionPerMinute += p.visionScore / (durationMin || 1);

      const champs = agg.champions;
      if (!champs.has(p.championName)) {
        champs.set(p.championName, { games: 0, wins: 0 });
      }
      const c = champs.get(p.championName)!;
      c.games++;
      if (p.win) c.wins++;
    }
  }

  // --- Construir métricas finales ---
  const metrics: PlayerMetrics[] = [];

  for (const member of members) {
    const agg = aggs.get(member.id);
    if (!agg || agg.games === 0) continue;

    const { games, wins, kills, deaths, assists, damage, vision, cs, gold, champions, damageShare, visionPerMinute } = agg;
    const losses = games - wins;
    const winrate = Math.round((wins / games) * 100);
    const avgKDA = deaths === 0 ? (kills + assists) : (kills + assists) / deaths;

    // Campeón más jugado
    let mostPlayed: PlayerMetrics['mostPlayedChampion'] = null;
    let maxGames = 0;
    for (const [name, data] of champions) {
      if (data.games > maxGames) {
        maxGames = data.games;
        mostPlayed = {
          name,
          games: data.games,
          winrate: Math.round((data.wins / data.games) * 100),
        };
      }
    }

    // Pool de campeones
    const championPool = Array.from(champions.entries())
      .map(([name, data]) => ({
        name,
        games: data.games,
        winrate: Math.round((data.wins / data.games) * 100),
      }))
      .sort((a, b) => b.games - a.games)
      .slice(0, 5);

    metrics.push({
      memberId: member.id,
      gameName: member.gameName,
      nickname: member.nickname,
      profileIconId: member.profileIconId || 29,
      totalGames: games,
      wins,
      losses,
      winrate,
      avgKills: Math.round((kills / games) * 10) / 10,
      avgDeaths: Math.round((deaths / games) * 10) / 10,
      avgAssists: Math.round((assists / games) * 10) / 10,
      avgKDA: Math.round(avgKDA * 100) / 100,
      avgDamage: Math.round(damage / games),
      avgVisionScore: Math.round(vision / games),
      avgCS: Math.round((cs / games) * 10) / 10,
      avgGold: Math.round(gold / games),
      mostPlayedChampion: mostPlayed,
      championPool,
      damageShare: Math.round((damageShare / games) * 100 * 10) / 10,
      visionPerMinute: Math.round((visionPerMinute / games) * 10) / 10,
    });
  }

  // Ordenar por winrate descendente
  metrics.sort((a, b) => b.winrate - a.winrate);

  return NextResponse.json({
    status: errors.length > 0 ? 'partial' : 'ok',
    errors,
    metrics,
    totalMatchesAnalyzed,
  } as PlayerMetricsResult);
}
