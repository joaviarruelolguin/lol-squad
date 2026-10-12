import { NextResponse } from 'next/server';
import { connection } from 'next/server';
import { ErrorInfo } from '@/lib/errors';
import { TrioResult, TrioStat } from '@/lib/types';
import { trioSynergyRating } from '@/lib/synergy';
import { getSquadMatchSet } from '@/lib/squadMatches';
import { guardRead } from '@/lib/rateLimit';

const MATCHES_PER_PLAYER = 20;
const FLEX_QUEUE = 440;
const MIN_GAMES = 2; // mínimo de partidas para que un trío sea confiable

export async function GET(req: Request) {
  await connection();

  const limited = guardRead(req, 'trios');
  if (limited) return limited;

  // Historial Flex de la squad, compartido con duos, composition, trends y
  // player-metrics. minSquadMembers filtra por 3+ sin bajar el detalle de las
  // que no pueden formar un trío.
  const { matches, errors, members } = await getSquadMatchSet({
    matchesPerPlayer: MATCHES_PER_PLAYER,
    queue: FLEX_QUEUE,
    minSquadMembers: 3,
  });

  if (members.length < 3) {
    return NextResponse.json({
      status: 'error' as const,
      errors: [{ type: 'NOT_FOUND' as const, message: 'Necesitamos al menos 3 miembros.' }],
      trios: [],
      scannedMatches: 0,
    } as TrioResult);
  }

  // Agregador de tríos: clave = ids ordenados de los 3 miembros
  const trioAgg = new Map<string, { wins: number; games: number; dates: number[] }>();
  const memberById = new Map(members.map((m) => [m.id, m]));

  let scannedMatches = 0;

  for (const match of matches) {
    const squadPlayers = match.squadParticipants;
    if (squadPlayers.length < 3) continue;
    scannedMatches++;

    const squadWon = squadPlayers[0]?.win ?? false;

    // Todos los sub-tríos de la partida (combinaciones de 3)
    for (let i = 0; i < squadPlayers.length; i++) {
      for (let j = i + 1; j < squadPlayers.length; j++) {
        for (let k = j + 1; k < squadPlayers.length; k++) {
          const ids = [
            squadPlayers[i].squadMemberId,
            squadPlayers[j].squadMemberId,
            squadPlayers[k].squadMemberId,
          ]
            .filter(Boolean)
            .sort() as string[];
          const key = ids.join('|');

          if (!trioAgg.has(key)) {
            trioAgg.set(key, { wins: 0, games: 0, dates: [] });
          }
          const t = trioAgg.get(key)!;
          t.games++;
          if (squadWon) t.wins++;
          t.dates.push(match.created);
        }
      }
    }
  }

  // Construir resultados
  const trios: TrioStat[] = [];
  for (const [key, data] of trioAgg) {
    if (data.games < MIN_GAMES) continue;
    const ids = key.split('|');
    const memberNames = ids.map((id) => {
      const m = memberById.get(id);
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
      synergyRating: trioSynergyRating(winrate, data.games),
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
