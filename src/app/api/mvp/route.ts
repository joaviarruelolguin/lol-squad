import { NextResponse } from 'next/server';
import { connection } from 'next/server';
import { getSquadMembers } from '@/lib/storage';
import { RiotApiClient, getRegionalRouting } from '@/lib/riot';
import { getRecentMatchesWithCache } from '@/lib/matchCache';
import { guardRead } from '@/lib/rateLimit';
import { SimpleCache } from '@/lib/cache';
import { ErrorInfo } from '@/lib/errors';
import type { MvpResult, MvpWindow, SquadMember } from '@/lib/types';
import {
  computeMvp,
  getRollingWindow,
  getWeekWindow,
  isUsableWindow,
  startOfWeek,
} from '@/lib/mvp';

/** Cola 440 = Flex ranked, la que usa la squad. */
const FLEX_QUEUE = 440;

/**
 * Cuántas partidas mirar por jugador.
 *
 * 20 cubre de sobra una semana de juego regular. Bajarlo arriesga que un jugador
 * que jugó el lunes no entre en la ventana; subirlo solo agrega requests que
 * terminamos descartando por fecha.
 */
const MATCHES_PER_PLAYER = 20;

const CACHE_TTL_MS = 15 * 60 * 1000;

/** Lo que cacheamos: el resultado sin `computedAt`, que se agrega al responder. */
type CachedResult = Omit<MvpResult, 'computedAt'>;

const resultCache = new SimpleCache<CachedResult>(CACHE_TTL_MS);

export async function GET(req: Request) {
  await connection();

  const limited = guardRead(req, 'mvp');
  if (limited) return limited;

  const now = Date.now();
  const weekStart = startOfWeek(now);

  // La clave lleva el lunes de la semana: al renovarse la semana, la clave
  // cambia sola y no servimos un MVP vencido.
  const cacheKey = `mvp:${weekStart}`;

  const cached = resultCache.get(cacheKey);
  if (cached) return respond(cached);

  const allMembers = await getSquadMembers();
  const members = allMembers.filter(
    (m): m is SquadMember & { puuid: string } => Boolean(m.puuid)
  );

  const weekWindow = getWeekWindow(now);

  if (members.length === 0) {
    return respond({
      status: 'error',
      errors: [
        { type: 'NOT_FOUND', message: 'No hay miembros en la squad para calcular el MVP.' },
      ],
      window: weekWindow,
      mvp: null,
      podium: [],
      ranking: [],
      matchesInWindow: 0,
      squad: { totalPlayerGames: 0, wins: 0, losses: 0, winrate: 0 },
      previous: null,
    });
  }

  // --- 1. Match IDs de todos los miembros, en paralelo ---
  //
  // En serie serían N esperas al rate limiter global (2 req/s) sin solapar nada.
  // El limiter sigue mandando sobre cuántas salen por segundo; el `allSettled`
  // evita además que un solo 404 tumbe la petición entera.
  const client = new RiotApiClient();
  const idResults = await Promise.allSettled(
    members.map((member) =>
      client.getMatchIdsByPuuid(
        member.puuid,
        getRegionalRouting(member.region),
        MATCHES_PER_PLAYER,
        FLEX_QUEUE
      )
    )
  );

  const errors: ErrorInfo[] = [];
  const allMatchIds: string[] = [];

  idResults.forEach((res, i) => {
    if (res.status === 'fulfilled') {
      allMatchIds.push(...res.value);
    } else {
      errors.push(toErrorInfo(res.reason, members[i].gameName));
    }
  });

  const uniqueIds = [...new Set(allMatchIds)];

  // --- 2. Traer solo lo que cae en la ventana ---
  //
  // El sufijo del match ID es monotónico pero no es un timestamp, así que no
  // sabemos la fecha sin pedir el detalle. Lo que sí sirve es ordenar por
  // recencia y cortar en cuanto aparecen partidas viejas: con una ventana de dos
  // semanas eso son unas 10-15 requests en lugar de ~120.
  const previousWindow: MvpWindow = {
    start: weekStart - 7 * 24 * 60 * 60 * 1000,
    end: weekStart,
    renewsAt: weekStart + 7 * 24 * 60 * 60 * 1000,
    kind: 'week',
    days: 7,
  };

  const routing = getRegionalRouting(members[0].region);
  const { matches } = await getRecentMatchesWithCache(
    uniqueIds,
    previousWindow.start,
    routing,
    { chunkSize: 8, maxMatches: 60 }
  );

  // --- 3. Ventana activa ---
  //
  // Preferimos la semana calendario. Si todavía no hay material (es lunes a la
  // mañana y no jugaron), caemos a los últimos 7 días para no dejar el banner
  // vacío: coronar sobre 0 partidas no tiene sentido, pero mostrar "MVP de la
  // semana pasada" tampoco.
  const weekAggregate = computeMvp(matches, members, weekWindow);
  const rolling = getRollingWindow(now);

  const useRolling = !isUsableWindow(weekAggregate.matchesInWindow);
  const activeWindow = useRolling ? rolling : weekWindow;
  const activeAggregate = useRolling
    ? computeMvp(matches, members, rolling)
    : weekAggregate;

  // La ventana de comparación es la inmediatamente anterior a la activa.
  const compareWindow: MvpWindow = {
    start: activeWindow.start - 7 * 24 * 60 * 60 * 1000,
    end: activeWindow.start,
    renewsAt: activeWindow.renewsAt,
    kind: 'week',
    days: 7,
  };
  const previousAgg = computeMvp(matches, members, compareWindow);
  const previousMvp = previousAgg.entries[0] ?? null;

  const ranking = activeAggregate.entries;
  const squadGames = activeAggregate.totalPlayerGames;
  const squadWins = activeAggregate.squadWins;

  return respond({
    status:
      errors.length > 0 && ranking.length > 0
        ? 'partial'
        : errors.length > 0 && ranking.length === 0
          ? 'error'
          : 'ok',
    errors,
    window: activeWindow,
    mvp: ranking[0] ?? null,
    podium: ranking.slice(0, 3),
    ranking,
    matchesInWindow: activeAggregate.matchesInWindow,
    squad: {
      totalPlayerGames: squadGames,
      wins: squadWins,
      losses: squadGames - squadWins,
      winrate: squadGames > 0 ? Math.round((squadWins / squadGames) * 100) : 0,
    },
    previous: previousMvp
      ? {
          memberId: previousMvp.memberId,
          gameName: previousMvp.gameName,
          score: previousMvp.score,
        }
      : null,
  });
}

function respond(result: CachedResult): NextResponse {
  resultCache.set(`mvp:${startOfWeek(Date.now())}`, result);
  return NextResponse.json({
    ...result,
    computedAt: new Date().toISOString(),
  });
}

function toErrorInfo(err: unknown, gameName?: string): ErrorInfo {
  if (err && typeof err === 'object' && 'type' in err && 'message' in err) {
    return err as ErrorInfo;
  }
  const detail = err instanceof Error ? err.message : String(err);
  return {
    type: 'NETWORK_ERROR',
    message: `No se pudo leer el historial de ${gameName ?? 'un miembro'}.`,
    detail,
  };
}
