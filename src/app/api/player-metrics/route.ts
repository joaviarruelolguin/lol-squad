import { NextResponse } from 'next/server';
import { connection } from 'next/server';
import { getSquadMembers } from '@/lib/storage';
import { RiotApiClient, getRegionalRouting } from '@/lib/riot';
import { ErrorInfo } from '@/lib/errors';
import {
  SquadMember,
  RegionalRouting,
  FlexPlayer,
  PlayerMetrics,
  PlayerMetricsResult,
} from '@/lib/types';

export async function GET() {
  await connection();

  const allMembers = await getSquadMembers();
  const members = allMembers.filter(
    (m): m is SquadMember & { puuid: string } => Boolean(m.puuid)
  );
  const client = new RiotApiClient();
  const errors: ErrorInfo[] = [];

  const FLEX_QUEUE = 440;
  const MATCHES_PER_PLAYER = 20;

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

  // --- Obtener todos los matchIds de los miembros ---
  const orderedMatchIds: string[] = [];
  const seen = new Set<string>();

  for (const member of members) {
    try {
      const routing = getRegionalRouting(member.region);
      const ids = await client.getMatchIdsByPuuid(
        member.puuid,
        routing,
        MATCHES_PER_PLAYER,
        FLEX_QUEUE
      );
      for (const id of ids) {
        if (!seen.has(id)) {
          seen.add(id);
          orderedMatchIds.push(id);
        }
      }
    } catch (err) {
      if (err instanceof Error) {
        errors.push({ type: 'NETWORK_ERROR', message: err.message });
      }
    }
  }

  const defaultRouting = getRegionalRouting(members[0]?.region ?? 'la2');
  const puuidToMember = new Map<string, SquadMember>(
    members.map((m) => [m.puuid, m])
  );

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

  // --- Un solo pass: obtener detalle y agregar todo ---
  for (const matchId of orderedMatchIds) {
    try {
      const detail = await client.getMatchDetail(matchId, defaultRouting);
      const info = detail?.info;
      if (!info || !Array.isArray(info.participants)) continue;

      const duration = info.gameDuration || 1;

      const players: FlexPlayer[] = info.participants.map((p: any) => {
        const squadMember = puuidToMember.get(p.puuid);
        return {
          puuid: p.puuid,
          riotIdGameName: p.riotIdGameName || 'Desconocido',
          riotIdTagline: p.riotIdTagline || '',
          squadMemberId: squadMember?.id,
          squadNickname: squadMember?.nickname,
          championId: p.championId,
          championName: p.championName || 'Unknown',
          teamId: p.teamId,
          win: p.win,
          kills: p.kills,
          deaths: p.deaths,
          assists: p.assists,
          totalDamageDealtToChampions: p.totalDamageDealtToChampions,
          physicalDamage: p.physicalDamageDealtToChampions,
          magicDamage: p.magicDamageDealt,
          trueDamage: p.trueDamageDealt,
          totalDamageTaken: p.totalDamageTaken,
          goldEarned: p.goldEarned,
          cs: p.totalMinionsKilled,
          visionScore: p.visionScore,
          wardsPlaced: p.wardsPlaced,
          wardsKilled: p.wardsKilled,
          damageDealtToObjectives: p.damageDealtToObjectives,
          role: p.role,
          lane: p.lane,
        };
      });

      // Solo contar la partida si tiene al menos 1 miembro de la squad
      const squadPlayers = players.filter((p) => p.squadMemberId);
      if (squadPlayers.length === 0) continue;
      totalMatchesAnalyzed++;

      // Suma total de daño del equipo para calcular share
      const teamDamage = new Map<number, number>();
      for (const p of players) {
        teamDamage.set(p.teamId, (teamDamage.get(p.teamId) || 0) + p.totalDamageDealtToChampions);
      }

      for (const p of squadPlayers) {
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
        const teamTotal = teamDamage.get(p.teamId) || 1;
        agg.damageShare += p.totalDamageDealtToChampions / teamTotal;
        agg.visionPerMinute += p.visionScore / (duration / 60);

        const champs = agg.champions;
        if (!champs.has(p.championName)) {
          champs.set(p.championName, { games: 0, wins: 0 });
        }
        const c = champs.get(p.championName)!;
        c.games++;
        if (p.win) c.wins++;
      }
    } catch {
      // silencioso: una partida no disponible no rompe el agregado
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
