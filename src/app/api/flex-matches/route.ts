import { NextResponse } from 'next/server';
import { connection } from 'next/server';
import { getSquadMembers } from '@/lib/storage';
import { RiotApiClient, getRegionalRouting } from '@/lib/riot';
import { RiotApiError, ErrorInfo } from '@/lib/errors';
import {
  FlexMatch,
  FlexPlayer,
  FlexTeam,
  WeakPoint,
  FlexResult,
  SquadMember,
  RegionalRouting,
} from '@/lib/types';
import { getMatchesWithCache } from '@/lib/matchCache';
import { guardRead } from '@/lib/rateLimit';

export async function GET(req: Request) {
  await connection();

  const limited = guardRead(req, 'flex-matches');
  if (limited) return limited;
  const { searchParams } = new URL(req.url);
  const offset = Math.max(0, Number(searchParams.get('offset') || 0));
  const limit = Math.min(20, Math.max(1, Number(searchParams.get('limit') || 5)));

  const allMembers = await getSquadMembers();
  const members = allMembers.filter(
    (m): m is SquadMember & { puuid: string } => Boolean(m.puuid)
  );
  const client = new RiotApiClient();
  const errors: ErrorInfo[] = [];

  const FLEX_QUEUE = 440; // RANKED_FLEX_SR
  const MATCHES_PER_PLAYER = 20;

  if (members.length === 0) {
    return NextResponse.json({
      status: 'error' as const,
      errors: [
        {
          type: 'NOT_FOUND' as const,
          message: 'No hay miembros en la squad para analizar partidas Flex.',
        },
      ],
      matches: [],
      matchesAnalyzed: 0,
      pagination: { offset, limit, total: 0, hasMore: false },
    } as FlexResult);
  }

  // --- Paso 1: IDs de últimas partidas FLEX, ordenados por primera aparición ---
  const orderedMatchIds: string[] = [];
  const seen = new Set<string>();
  const matchToPuuids = new Map<string, Set<string>>();

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
        if (!matchToPuuids.has(id)) matchToPuuids.set(id, new Set());
        matchToPuuids.get(id)!.add(member.puuid);

        if (!seen.has(id)) {
          seen.add(id);
          orderedMatchIds.push(id);
        }
      }
    } catch (err) {
      errors.push(toErrorInfo(err));
    }
  }

  // --- Paso 2: paginar y traer SOLO el detalle de esta página ---
  const total = orderedMatchIds.length;
  const pageIds = orderedMatchIds.slice(offset, offset + limit);
  const hasMore = offset + limit < total;

  const puuidToMember = new Map<string, SquadMember>(
    members.map((m) => [m.puuid, m])
  );
  const defaultRouting = getRegionalRouting(members[0]?.region ?? 'la2');

  const matches: FlexMatch[] = [];

  // Detalles de la página en un lote: los que ya están en match_cache no
  // tocan Riot, y los que faltan van con concurrencia acotada en vez de
  // uno por uno (que a 2 req/s convertía cada página en ~5 segundos).
  const details = await getMatchesWithCache(pageIds, defaultRouting);

  for (const { matchId, info } of details) {
    try {
      if (!info || !Array.isArray(info.participants)) continue;

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
          win: Boolean(p.win),
          kills: p.kills || 0,
          deaths: p.deaths || 0,
          assists: p.assists || 0,
          totalDamageDealtToChampions: p.totalDamageDealtToChampions || 0,
          physicalDamage: p.physicalDamageDealtToChampions || 0,
          magicDamage: p.magicDamageDealtToChampions || 0,
          trueDamage: p.trueDamageDealtToChampions || 0,
          totalDamageTaken: p.totalDamageTaken || 0,
          goldEarned: p.goldEarned || 0,
          cs: (p.totalMinionsKilled || 0) + (p.neutralMinionsKilled || 0),
          visionScore: p.visionScore || 0,
          wardsPlaced: p.wardsPlaced || 0,
          wardsKilled: p.wardsKilled || 0,
          damageDealtToObjectives: p.damageDealtToObjectives || 0,
          role: p.role || 'NONE',
          lane: p.lane || 'NONE',
        };
      });

      const teams: FlexTeam[] = [100, 200].map((teamId) => {
        const teamPlayers = players.filter((p) => p.teamId === teamId);
        const totalDamage = teamPlayers.reduce(
          (s, p) => s + p.totalDamageDealtToChampions,
          0
        );
        return {
          teamId,
          win: teamPlayers[0]?.win ?? false,
          players: teamPlayers,
          totalDamage,
        };
      });

      const squadMembersInMatch = [...(matchToPuuids.get(matchId) || [])]
        .map((puuid) => puuidToMember.get(puuid))
        .filter((m): m is SquadMember => Boolean(m))
        .map((m) => {
          const player = players.find((p) => p.puuid === m.puuid);
          return {
            id: m.id,
            gameName: m.gameName,
            nickname: m.nickname,
            win: player?.win ?? false,
          };
        });

      const weakPoints = computeWeakPoints(players, teams);

      matches.push({
        matchId,
        date: new Date(info.gameCreation).toISOString(),
        duration: info.gameDuration || 0,
        queueId: info.queueId,
        gameVersion: info.gameVersion || '',
        squadMemberCount: (matchToPuuids.get(matchId) || new Set()).size,
        squadMembers: squadMembersInMatch,
        teams,
        weakPoints,
      });
    } catch (err) {
      errors.push(toErrorInfo(err));
    }
  }

  // Ordenar la página por fecha descendente
  matches.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const status: FlexResult['status'] =
    errors.length === 0 ? 'ok' : matches.length > 0 ? 'partial' : 'error';

  return NextResponse.json({
    status,
    errors,
    matches,
    matchesAnalyzed: matches.length,
    pagination: { offset, limit, total, hasMore },
  } as FlexResult);
}

// ---------- Análisis de puntos a mejorar (lenguaje constructivo) ----------
function displayName(p: FlexPlayer): string {
  return p.squadNickname
    ? `${p.riotIdGameName} (${p.squadNickname})`
    : p.riotIdGameName;
}

function fmtDamage(dmg: number): string {
  return `${(dmg / 1000).toFixed(1)}k`;
}

function computeWeakPoints(
  players: FlexPlayer[],
  teams: FlexTeam[]
): WeakPoint[] {
  const weakPoints: WeakPoint[] = [];
  if (players.length === 0) return weakPoints;

  // 1. Muchas muertes
  const mostDeaths = [...players].sort((a, b) => b.deaths - a.deaths)[0];
  if (mostDeaths && mostDeaths.deaths >= 6) {
    weakPoints.push({
      type: 'FED',
      title: 'Muchas muertes',
      detail: `${displayName(mostDeaths)} cayó ${mostDeaths.deaths} veces (${mostDeaths.kills}/${mostDeaths.deaths}/${mostDeaths.assists}) en ${mostDeaths.championName}`,
      playerName: displayName(mostDeaths),
    });
  }

  // 2. Sin kills (con varias muertes)
  const zeroImpact = players.filter((p) => p.kills === 0 && p.deaths >= 4);
  for (const p of zeroImpact) {
    weakPoints.push({
      type: 'ZERO_IMPACT',
      title: 'Sin kills',
      detail: `${displayName(p)}: 0 kills en ${p.championName} (${p.kills}/${p.deaths}/${p.assists})`,
      playerName: displayName(p),
    });
  }

  // 3. Menor aporte de daño (excluyendo supports)
  const totalAllDamage = players.reduce(
    (s, p) => s + p.totalDamageDealtToChampions,
    0
  );
  if (totalAllDamage > 0) {
    const lowestDamage = [...players].sort(
      (a, b) => a.totalDamageDealtToChampions - b.totalDamageDealtToChampions
    )[0];
    const share = (
      (lowestDamage.totalDamageDealtToChampions / totalAllDamage) *
      100
    ).toFixed(1);
    const isSupport =
      lowestDamage.lane === 'BOTTOM' && lowestDamage.role === 'SUPPORT';
    if (!isSupport && Number(share) < 4) {
      weakPoints.push({
        type: 'LOW_DAMAGE',
        title: 'Menor aporte de daño',
        detail: `${displayName(lowestDamage)} aportó ${share}% del daño total (${fmtDamage(lowestDamage.totalDamageDealtToChampions)}) en ${lowestDamage.championName}`,
        playerName: displayName(lowestDamage),
      });
    }
  }

  // 4. Poca visión
  const lowestVision = [...players].sort(
    (a, b) => a.visionScore - b.visionScore
  )[0];
  if (lowestVision && lowestVision.visionScore < 15) {
    weakPoints.push({
      type: 'LOW_VISION',
      title: 'Poca visión',
      detail: `${displayName(lowestVision)} con ${lowestVision.visionScore} pts de visión (${lowestVision.wardsPlaced} wards colocados)`,
      playerName: displayName(lowestVision),
    });
  }

  // 5. Brecha de daño entre equipos
  if (teams.length === 2) {
    const [tA, tB] = teams;
    const loser = tA.win ? tB : tA;
    const winner = tA.win ? tA : tB;
    const gap = winner.totalDamage - loser.totalDamage;
    if (gap > 0) {
      weakPoints.push({
        type: 'DAMAGE_GAP',
        title: 'Brecha de daño',
        detail: `El equipo perdedor hizo ${fmtDamage(gap)} menos de daño (${fmtDamage(loser.totalDamage)} vs ${fmtDamage(winner.totalDamage)})`,
      });
    }
  }

  return weakPoints;
}

function toErrorInfo(err: unknown): ErrorInfo {
  if (err instanceof RiotApiError) return err.toInfo();
  if (err && typeof err === 'object' && 'type' in err && 'message' in err) {
    return err as ErrorInfo;
  }
  return {
    type: 'UNKNOWN',
    message: 'Error inesperado al analizar partidas Flex.',
    detail: String(err),
  };
}

// Derivar el routing regional desde el prefijo del matchId (ej: LA2_xxx)
export function routingFromMatchId(matchId: string): RegionalRouting {
  const prefix = matchId.split('_')[0]?.toUpperCase();
  if (['LA1', 'LA2', 'BR1', 'NA1'].includes(prefix)) return 'americas';
  if (['EUW1', 'EUNE', 'RU', 'TR'].includes(prefix)) return 'europe';
  if (['JP', 'KR'].includes(prefix)) return 'asia';
  if (['SG', 'ID', 'PH', 'TH', 'VN'].includes(prefix)) return 'sea';
  return 'americas';
}
