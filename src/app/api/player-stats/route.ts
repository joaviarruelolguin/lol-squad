import { NextResponse } from 'next/server';
import { connection } from 'next/server';
import { getSquadMembers } from '@/lib/storage';
import { RiotApiClient, getRegionalRouting } from '@/lib/riot';
import { ErrorInfo } from '@/lib/errors';
import { SquadMember, PlayerStatsResult, PlayerAward } from '@/lib/types';
import { getMatchesWithCache } from '@/lib/matchCache';
import { guardRead } from '@/lib/rateLimit';

export async function GET(req: Request) {
  await connection();

  const limited = guardRead(req, 'player-stats');
  if (limited) return limited;

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
      errors: [{ type: 'NOT_FOUND' as const, message: 'No hay miembros.' }],
      awards: [],
      roleStats: [],
      tiltData: [],
      totalMatches: 0,
    } as PlayerStatsResult);
  }

  // Obtener matchIds
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

  // Agregadores para awards y stats
  interface PlayerAgg {
    games: number;
    wins: number;
    kills: number;
    deaths: number;
    assists: number;
    damage: number;
    gold: number;
    vision: number;
    cs: number;
    wardsPlaced: number;
    wardsKilled: number;
    damageShare: number;
    killsParticipation: number;
    roles: Map<string, { games: number; wins: number }>;
    // Tilt: rendimiento después de victoria vs derrota
    afterWin: { games: number; wins: number };
    afterLoss: { games: number; wins: number };
    // Streaks
    currentStreak: number;
    bestWinStreak: number;
    worstLossStreak: number;
  }

  const aggs = new Map<string, PlayerAgg>();
  const getAgg = (memberId: string): PlayerAgg => {
    if (!aggs.has(memberId)) {
      aggs.set(memberId, {
        games: 0,
        wins: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        damage: 0,
        gold: 0,
        vision: 0,
        cs: 0,
        wardsPlaced: 0,
        wardsKilled: 0,
        damageShare: 0,
        killsParticipation: 0,
        roles: new Map(),
        afterWin: { games: 0, wins: 0 },
        afterLoss: { games: 0, wins: 0 },
        currentStreak: 0,
        bestWinStreak: 0,
        worstLossStreak: 0,
      });
    }
    return aggs.get(memberId)!;
  };

  let totalMatches = 0;
  // Historial cronológico por jugador para el tilt meter
  const playerTimeline = new Map<string, { matchId: string; won: boolean }[]>();

  // Detalles en un lote: los que ya están en match_cache no tocan Riot, y los
  // que faltan se piden con concurrencia acotada. El helper preserva el orden
  // de orderedMatchIds, así que el historial cronológico del tilt queda igual.
  const details = await getMatchesWithCache(orderedMatchIds, defaultRouting);

  for (const { matchId, info } of details) {
    try {
      if (!info || !Array.isArray(info.participants)) continue;

      const squadPlayers = info.participants.filter(
        (p: any) => puuidToMember.has(p.puuid)
      );
      if (squadPlayers.length === 0) continue;
      totalMatches++;

      // Registrar resultado individual de cada miembro para el tilt
      for (const p of squadPlayers) {
        const member = puuidToMember.get(p.puuid)!;
        if (!playerTimeline.has(member.id)) playerTimeline.set(member.id, []);
        playerTimeline.get(member.id)!.push({ matchId, won: p.win ?? false });
      }

      // Team kills y damage para kill participation y damage share
      const teamKills = new Map<number, number>();
      const teamDamage = new Map<number, number>();
      for (const p of info.participants) {
        teamKills.set(p.teamId, (teamKills.get(p.teamId) || 0) + (p.kills || 0));
        teamDamage.set(p.teamId, (teamDamage.get(p.teamId) || 0) + (p.totalDamageDealtToChampions || 0));
      }

      for (const p of squadPlayers) {
        const member = puuidToMember.get(p.puuid)!;
        const agg = getAgg(member.id);
        agg.games++;
        if (p.win) agg.wins++;
        agg.kills += p.kills || 0;
        agg.deaths += p.deaths || 0;
        agg.assists += p.assists || 0;
        agg.damage += p.totalDamageDealtToChampions || 0;
        agg.gold += p.goldEarned || 0;
        agg.vision += p.visionScore || 0;
        agg.cs += (p.totalMinionsKilled || 0) + (p.neutralMinionsKilled || 0);
        agg.wardsPlaced += p.wardsPlaced || 0;
        agg.wardsKilled += p.wardsKilled || 0;

        const tk = teamKills.get(p.teamId) || 1;
        const td = teamDamage.get(p.teamId) || 1;
        agg.killsParticipation += ((p.kills || 0) + (p.assists || 0)) / tk;
        agg.damageShare += (p.totalDamageDealtToChampions || 0) / td;

        const role = p.role || 'FILL';
        if (!agg.roles.has(role)) agg.roles.set(role, { games: 0, wins: 0 });
        const r = agg.roles.get(role)!;
        r.games++;
        if (p.win) r.wins++;
      }
    } catch {
      // ignorar
    }
  }

  // Tilt meter: winrate del jugador después de su propia V/D anterior
  for (const member of members) {
    const timeline = playerTimeline.get(member.id);
    if (!timeline || timeline.length < 2) continue;
    const agg = getAgg(member.id);
    for (let i = 1; i < timeline.length; i++) {
      const prevWon = timeline[i - 1].won;
      const nowWon = timeline[i].won;
      if (prevWon) {
        agg.afterWin.games++;
        if (nowWon) agg.afterWin.wins++;
      } else {
        agg.afterLoss.games++;
        if (nowWon) agg.afterLoss.wins++;
      }
    }
    // Rachas
    let streakType = timeline[0].won;
    let streakLen = 1;
    for (let i = 1; i < timeline.length; i++) {
      if (timeline[i].won === streakType) {
        streakLen++;
      } else {
        if (streakType && streakLen > agg.bestWinStreak) agg.bestWinStreak = streakLen;
        if (!streakType && streakLen > agg.worstLossStreak) agg.worstLossStreak = streakLen;
        streakType = timeline[i].won;
        streakLen = 1;
      }
    }
    if (streakType && streakLen > agg.bestWinStreak) agg.bestWinStreak = streakLen;
    if (!streakType && streakLen > agg.worstLossStreak) agg.worstLossStreak = streakLen;
  }

  // Construir awards y stats
  const awards: PlayerAward[] = [];
  const roleStats: PlayerStatsResult['roleStats'] = [];

  for (const member of members) {
    const agg = aggs.get(member.id);
    if (!agg || agg.games === 0) continue;

    // Awards
    if (agg.deaths / agg.games >= 8) {
      awards.push({ memberId: member.id, title: 'El que más se murió', emoji: '💀', value: `${(agg.deaths / agg.games).toFixed(1)} muertes/partida` });
    }
    if (agg.wardsPlaced / agg.games >= 15) {
      awards.push({ memberId: member.id, title: 'Ward Bot', emoji: '👁️', value: `${(agg.wardsPlaced / agg.games).toFixed(1)} wards/partida` });
    }
    // Ojo con la precedencia: hay que promediar la SUMA, no sumar el promedio.
    // agg.kills y agg.assists son totales acumulados, no promedios.
    if ((agg.kills + agg.assists) / agg.games >= 10) {
      awards.push({ memberId: member.id, title: 'Máquina de kills', emoji: '🔥', value: `${((agg.kills + agg.assists) / agg.games).toFixed(1)} K+A/partida` });
    }
    if (agg.damage / agg.games >= 30000) {
      awards.push({ memberId: member.id, title: 'Daño total', emoji: '💥', value: `${Math.round(agg.damage / agg.games / 1000)}k daño/partida` });
    }
    if (agg.vision / agg.games >= 30) {
      awards.push({ memberId: member.id, title: 'Ojo de halcón', emoji: '🦅', value: `${(agg.vision / agg.games).toFixed(1)} visión/partida` });
    }
    if (agg.bestWinStreak >= 3) {
      awards.push({ memberId: member.id, title: 'Racha de victorias', emoji: '🚀', value: `${agg.bestWinStreak} Wins seguidos` });
    }
    if (agg.worstLossStreak >= 3) {
      awards.push({ memberId: member.id, title: 'Racha de derrotas', emoji: '📉', value: `${agg.worstLossStreak} derrotas seguidas` });
    }
    if (agg.killsParticipation / agg.games >= 0.7) {
      awards.push({ memberId: member.id, title: 'Participación en kills', emoji: '🎯', value: `${Math.round((agg.killsParticipation / agg.games) * 100)}% KP` });
    }
    if (agg.damageShare / agg.games >= 0.28) {
      awards.push({ memberId: member.id, title: 'Aportador de daño', emoji: '🔥', value: `${Math.round((agg.damageShare / agg.games) * 100)}% del daño del equipo` });
    }

    // Role stats
    for (const [role, data] of agg.roles) {
      roleStats.push({
        memberId: member.id,
        role,
        games: data.games,
        winrate: Math.round((data.wins / data.games) * 100),
      });
    }
  }

  // Tilt data (por jugador)
  const tiltData: PlayerStatsResult['tiltData'] = [];
  for (const member of members) {
    const agg = aggs.get(member.id);
    if (!agg || agg.games === 0) continue;
    tiltData.push({
      memberId: member.id,
      afterWinWinrate: agg.afterWin.games > 0 ? Math.round((agg.afterWin.wins / agg.afterWin.games) * 100) : null,
      afterLossWinrate: agg.afterLoss.games > 0 ? Math.round((agg.afterLoss.wins / agg.afterLoss.games) * 100) : null,
    });
  }

  return NextResponse.json({
    status: errors.length > 0 ? 'partial' : 'ok',
    errors,
    awards,
    roleStats,
    tiltData,
    totalMatches,
  } as PlayerStatsResult);
}
