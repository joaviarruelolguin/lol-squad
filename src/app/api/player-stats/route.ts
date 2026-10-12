import { NextResponse } from 'next/server';
import { connection } from 'next/server';
import { ErrorInfo } from '@/lib/errors';
import { PlayerStatsResult, PlayerAward } from '@/lib/types';
import { getSquadMatchSet } from '@/lib/squadMatches';
import { guardRead } from '@/lib/rateLimit';

const FLEX_QUEUE = 440;
const MATCHES_PER_PLAYER = 20;

export async function GET(req: Request) {
  await connection();

  const limited = guardRead(req, 'player-stats');
  if (limited) return limited;

  // Historial Flex de la squad, compartido con duos, trios, composition, trends
  // y player-metrics. El helper preserva el orden de los match IDs (recorados
  // miembro por miembro, del más nuevo al más viejo), así que el historial
  // cronológico que necesita el tilt meter queda igual.
  const { matches, members, errors } = await getSquadMatchSet({
    matchesPerPlayer: MATCHES_PER_PLAYER,
    queue: FLEX_QUEUE,
  });

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
    // Tilt: rendimiento despues de victoria vs derrota
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
  // Historial cronologico por jugador para el tilt meter
  const playerTimeline = new Map<string, { matchId: string; won: boolean }[]>();

  for (const match of matches) {
    const squadPlayers = match.squadParticipants;
    if (squadPlayers.length === 0) continue;
    totalMatches++;

    // Registrar resultado individual de cada miembro para el tilt
    for (const p of squadPlayers) {
      const memberId = p.squadMemberId!;
      if (!playerTimeline.has(memberId)) playerTimeline.set(memberId, []);
      playerTimeline.get(memberId)!.push({ matchId: match.matchId, won: p.win });
    }

    // Team kills para la kill participation
    const teamKills = new Map<number, number>();
    for (const p of match.participants) {
      teamKills.set(p.teamId, (teamKills.get(p.teamId) || 0) + p.kills);
    }

    for (const p of squadPlayers) {
      const agg = getAgg(p.squadMemberId!);
      agg.games++;
      if (p.win) agg.wins++;
      agg.kills += p.kills;
      agg.deaths += p.deaths;
      agg.assists += p.assists;
      agg.damage += p.totalDamageDealtToChampions;
      agg.gold += p.goldEarned;
      agg.vision += p.visionScore;
      agg.cs += p.cs;
      agg.wardsPlaced += p.wardsPlaced;
      agg.wardsKilled += p.wardsKilled;

      const tk = teamKills.get(p.teamId) || 1;
      const td = match.teamDamage.get(p.teamId) || 1;
      agg.killsParticipation += (p.kills + p.assists) / tk;
      agg.damageShare += p.totalDamageDealtToChampions / td;

      const role = p.role || 'FILL';
      if (!agg.roles.has(role)) agg.roles.set(role, { games: 0, wins: 0 });
      const r = agg.roles.get(role)!;
      r.games++;
      if (p.win) r.wins++;
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
