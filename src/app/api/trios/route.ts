import { NextResponse } from 'next/server';
import { connection } from 'next/server';
import { getSquadMembers } from '@/lib/storage';
import { RiotApiClient, getRegionalRouting } from '@/lib/riot';
import { ErrorInfo } from '@/lib/errors';
import { SquadMember, TrioResult, TrioStat } from '@/lib/types';
import { trioSynergyRating } from '@/lib/synergy';
import { getMatchesWithCache } from '@/lib/matchCache';
import { guardRead } from '@/lib/rateLimit';

const MATCHES_PER_PLAYER = 20;
const FLEX_QUEUE = 440;
const MIN_GAMES = 2; // mínimo de partidas para que un trío sea confiable

export async function GET(req: Request) {
  await connection();

  const limited = guardRead(req, 'trios');
  if (limited) return limited;

  const allMembers = await getSquadMembers();
  const members = allMembers.filter(
    (m): m is SquadMember & { puuid: string } => Boolean(m.puuid)
  );
  const client = new RiotApiClient();
  const errors: ErrorInfo[] = [];

  if (members.length < 3) {
    return NextResponse.json({
      status: 'error' as const,
      errors: [{ type: 'NOT_FOUND' as const, message: 'Necesitamos al menos 3 miembros.' }],
      trios: [],
      scannedMatches: 0,
    } as TrioResult);
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
      if (err instanceof Error) errors.push({ type: 'NETWORK_ERROR' as const, message: err.message });
    }
  }

  const defaultRouting = getRegionalRouting(members[0]?.region ?? 'la2');
  const puuidToMember = new Map<string, SquadMember>(members.map((m) => [m.puuid, m]));

  // Agregador de tríos: clave = ids ordenados de los 3 miembros
  const trioAgg = new Map<string, { wins: number; games: number; dates: number[] }>();

  let scannedMatches = 0;

  // Pedimos todos los detalles en un lote: los que ya están en match_cache
  // no tocan Riot, y los que faltan van con concurrencia acotada en vez de
  // uno por uno (que a 2 req/s convertía este endpoint en 20 segundos).
  const details = await getMatchesWithCache(orderedMatchIds, defaultRouting);

  for (const { info } of details) {
    try {
      if (!info || !Array.isArray(info.participants)) continue;

      const squadPlayers = info.participants.filter((p: any) => puuidToMember.has(p.puuid));
      if (squadPlayers.length < 3) continue;
      scannedMatches++;

      const squadWon = squadPlayers[0]?.win ?? false;
      const gameCreation = info.gameCreation || 0;

      // Generar todos los sub-tríos de la partida (combinaciones de 3)
      for (let i = 0; i < squadPlayers.length; i++) {
        for (let j = i + 1; j < squadPlayers.length; j++) {
          for (let k = j + 1; k < squadPlayers.length; k++) {
            const trio = [squadPlayers[i], squadPlayers[j], squadPlayers[k]];
            const ids = trio
              .map((p: any) => puuidToMember.get(p.puuid)!.id)
              .sort();
            const key = ids.join('|');

            if (!trioAgg.has(key)) {
              trioAgg.set(key, { wins: 0, games: 0, dates: [] });
            }
            const t = trioAgg.get(key)!;
            t.games++;
            if (squadWon) t.wins++;
            t.dates.push(gameCreation);
          }
        }
      }
    } catch {
      // ignorar
    }
  }

  // Construir resultados
  const trios: TrioStat[] = [];
  for (const [key, data] of trioAgg) {
    if (data.games < MIN_GAMES) continue;
    const ids = key.split('|');
    const memberNames = ids.map((id) => {
      const m = members.find((mm) => mm.id === id);
      return { id, name: m?.gameName || 'Desconocido', nickname: m?.nickname };
    });
    const winrate = Math.round((data.wins / data.games) * 100);
    const lastPlayed = data.dates.length > 0 ? Math.max(...data.dates) : 0;

    trios.push({
      memberIds: ids,
      memberNames,
      totalGames: data.games,
      wins: data.wins,
      losses: data.games - data.wins,
      winrate,
      synergyRating: synergyRating(winrate, data.games),
      lastPlayed,
    });
  }

  // Ordenar: mejor winrate primero, después más partidas
  trios.sort((a, b) => {
    if (b.winrate !== a.winrate) return b.winrate - a.winrate;
    return b.totalGames - a.totalGames;
  });

  return NextResponse.json({
    status: errors.length > 0 ? 'partial' : 'ok',
    errors,
    trios,
    scannedMatches,
  } as TrioResult);
}

function synergyRating(
  winrate: number,
  games: number
): TrioStat['synergyRating'] {
  return trioSynergyRating(winrate, games);
}