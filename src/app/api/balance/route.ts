import { NextResponse } from 'next/server';
import { connection } from 'next/server';
import { getSquadMembers } from '@/lib/storage';
import { RiotApiClient, getRegionalRouting } from '@/lib/riot';
import { SquadMember } from '@/lib/types';
import { checkRateLimit, getClientIp, rateLimitResponse, LIMITS } from '@/lib/rateLimit';
import {
  readJson,
  requireStringArray,
  validationErrorResponse,
} from '@/lib/validate';

const MATCHES_PER_PLAYER = 20;
const FLEX_QUEUE = 440;

interface PlayerPower {
  memberId: string;
  gameName: string;
  nickname: string;
  role: string;
  overall: number;      // 0-100 score combinado
  winrate: number;
  kda: number;
  damage: number;
  vision: number;
  games: number;
}

export async function POST(req: Request) {
  await connection();

  // Rate limit: cada balanceo pide datos a Riot
  const limited = rateLimitResponse(
    checkRateLimit(
      `balance:${getClientIp(req)}`,
      LIMITS.balance.limit,
      LIMITS.balance.windowMs
    )
  );
  if (limited) return limited;

  try {
    const parsed = await readJson(req);
    if (!parsed.ok) return validationErrorResponse(parsed);

    const idsR = requireStringArray(parsed.value.playerIds, 'playerIds', {
      maxItems: 10,
      maxLen: 128,
    });
    if (!idsR.ok) return validationErrorResponse(idsR);

    const playerIds = idsR.value;
    if (playerIds.length < 2) {
      return NextResponse.json(
        { error: 'Necesitamos al menos 2 jugadores para balancear.' },
        { status: 400 }
      );
    }

    const allMembers = await getSquadMembers();
    const selected = allMembers.filter(
      (m): m is SquadMember & { puuid: string } =>
        Boolean(m.puuid) && playerIds.includes(m.id)
    );

    if (selected.length < 2) {
      return NextResponse.json(
        { error: 'Los jugadores seleccionados no tienen datos de Riot.' },
        { status: 400 }
      );
    }

    const client = new RiotApiClient();

    // Calcular poder de cada jugador seleccionado
    const powers: PlayerPower[] = [];

    for (const member of selected) {
      try {
        const routing = getRegionalRouting(member.region);
        const ids = await client.getMatchIdsByPuuid(
          member.puuid,
          routing,
          MATCHES_PER_PLAYER,
          FLEX_QUEUE
        );

        let games = 0, wins = 0, kills = 0, deaths = 0, assists = 0;
        let damage = 0, vision = 0;

        for (const matchId of ids.slice(0, 10)) {
          try {
            const detail = await client.getMatchDetail(matchId, routing);
            const info = detail?.info;
            if (!info || !Array.isArray(info.participants)) continue;
            const me = info.participants.find((p: any) => p.puuid === member.puuid);
            if (!me) continue;
            games++;
            if (me.win) wins++;
            kills += me.kills || 0;
            deaths += me.deaths || 0;
            assists += me.assists || 0;
            damage += me.totalDamageDealtToChampions || 0;
            vision += me.visionScore || 0;
          } catch {
            continue;
          }
        }

        if (games === 0) {
          powers.push({
            memberId: member.id,
            gameName: member.gameName,
            nickname: member.nickname,
            role: member.role || 'FILL',
            overall: 50,
            winrate: 50,
            kda: 0,
            damage: 0,
            vision: 0,
            games: 0,
          });
          continue;
        }

        const winrate = Math.round((wins / games) * 100);
        const kda = deaths === 0 ? kills + assists : (kills + assists) / deaths;
        const avgDamage = damage / games;
        const avgVision = vision / games;

        // Score combinado 0-100
        // WR 40% + KDA 25% + daño 20% + visión 15%
        const wrScore = winrate;
        const kdaScore = Math.min(100, (kda / 4) * 100);
        const dmgScore = Math.min(100, (avgDamage / 30000) * 100);
        const visScore = Math.min(100, (avgVision / 40) * 100);
        const overall = Math.round(
          wrScore * 0.4 + kdaScore * 0.25 + dmgScore * 0.2 + visScore * 0.15
        );

        powers.push({
          memberId: member.id,
          gameName: member.gameName,
          nickname: member.nickname,
          role: member.role || 'FILL',
          overall,
          winrate,
          kda: Math.round(kda * 100) / 100,
          damage: Math.round(avgDamage),
          vision: Math.round(avgVision),
          games,
        });
      } catch {
        powers.push({
          memberId: member.id,
          gameName: member.gameName,
          nickname: member.nickname,
          role: member.role || 'FILL',
          overall: 50,
          winrate: 50,
          kda: 0,
          damage: 0,
          vision: 0,
          games: 0,
        });
      }
    }

    // Ordenar por poder y repartir en dos equipos equilibrados (serpenteo)
    const sorted = [...powers].sort((a, b) => b.overall - a.overall);
    const teamA: PlayerPower[] = [];
    const teamB: PlayerPower[] = [];

    sorted.forEach((p, i) => {
      if (i % 2 === 0) teamA.push(p);
      else teamB.push(p);
    });

    const sumA = teamA.reduce((s, p) => s + p.overall, 0);
    const sumB = teamB.reduce((s, p) => s + p.overall, 0);

    // Intentar compensar: si el desequilibrio es grande, mover un jugador
    if (Math.abs(sumA - sumB) > Math.max(sumA, sumB) * 0.15 && teamA.length > 1 && teamB.length > 1) {
      const weakestA = teamA.reduce((min, p) => (p.overall < min.overall ? p : min), teamA[0]);
      const strongestB = teamB.reduce((max, p) => (p.overall > max.overall ? p : max), teamB[0]);
      if (weakestA.overall < strongestB.overall) {
        teamA.splice(teamA.indexOf(weakestA), 1);
        teamB.splice(teamB.indexOf(strongestB), 1);
        teamA.push(strongestB);
        teamB.push(weakestA);
      }
    }

    const finalAvgA = Math.round(teamA.reduce((s, p) => s + p.overall, 0) / Math.max(1, teamA.length));
    const finalAvgB = Math.round(teamB.reduce((s, p) => s + p.overall, 0) / Math.max(1, teamB.length));

    return NextResponse.json({
      success: true,
      teamA,
      teamB,
      balance: {
        avgA: finalAvgA,
        avgB: finalAvgB,
        diff: Math.abs(finalAvgA - finalAvgB),
        fair: Math.abs(finalAvgA - finalAvgB) <= 8,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Error inesperado' }, { status: 500 });
  }
}