import { NextResponse } from 'next/server';
import { connection } from 'next/server';
import { DuoStat } from '@/lib/types';
import { ErrorInfo } from '@/lib/errors';
import { duoSynergyRating } from '@/lib/synergy';
import { getSquadMatchSet } from '@/lib/squadMatches';
import { guardRead } from '@/lib/rateLimit';

export interface DuoResult {
  status: 'ok' | 'partial' | 'error';
  errors: ErrorInfo[];
  duos: DuoStat[];
  scannedMatches: number;
  membersAnalyzed: number;
}

const MATCHES_PER_PLAYER = 20;
const FLEX_QUEUE = 440;

export async function GET(req: Request) {
  await connection();

  const limited = guardRead(req, 'duos');
  if (limited) return limited;

  // El historial Flex de la squad es el mismo dataset que usan trios,
  // composition, trends y player-metrics. Pedirlo por acá los comparte en vez de
  // repetir los pedidos a Riot y el parseo de ~100 partidas.
  // minSquadMembers filtra por 2+ sin bajar el detalle de las que no cuentan:
  // getSquadMatchSet ya sabe cuántos de la squad vio en cada historial.
  const { matches, errors, members } = await getSquadMatchSet({
    matchesPerPlayer: MATCHES_PER_PLAYER,
    queue: FLEX_QUEUE,
    minSquadMembers: 2,
  });

  if (members.length < 2) {
    return NextResponse.json({
      status: 'error' as const,
      errors: [
        {
          type: 'NOT_FOUND' as const,
          message:
            'Necesitamos al menos 2 miembros con datos resueltos para analizar sinergias. Agregá más amigos a la squad.',
        },
      ],
      duos: [],
      scannedMatches: 0,
      membersAnalyzed: members.length,
    } as DuoResult);
  }

  // clave de pareja "puuidA|puuidB" (ordenados) -> { wins, losses, games }
  const pairStats = new Map<string, { wins: number; losses: number; games: number }>();
  let scannedMatches = 0;

  for (const match of matches) {
    const squadPlayers = match.squadParticipants;
    if (squadPlayers.length < 2) continue;
    scannedMatches++;

    for (let i = 0; i < squadPlayers.length; i++) {
      for (let j = i + 1; j < squadPlayers.length; j++) {
        const a = squadPlayers[i];
        const b = squadPlayers[j];
        const key = [a.puuid, b.puuid].sort().join('|');
        if (!pairStats.has(key)) pairStats.set(key, { wins: 0, losses: 0, games: 0 });
        const ps = pairStats.get(key)!;
        ps.games++;

        // Solo contabilizamos si compartieron resultado (mismo equipo): los dos
        // ganaron o los dos perdieron.
        if (a.win === b.win) {
          if (a.win) ps.wins++;
          else ps.losses++;
        }
      }
    }
  }

  // --- Armar el resultado por pareja ---
  const puuidToMember = new Map(members.map((m) => [m.puuid, m]));

  const duos: DuoStat[] = [];
  for (const [key, ps] of pairStats) {
    const [p1, p2] = key.split('|');
    const m1 = puuidToMember.get(p1);
    const m2 = puuidToMember.get(p2);
    if (!m1 || !m2) continue;

    const total = ps.wins + ps.losses;
    const winrate = total > 0 ? Math.round((ps.wins / total) * 100) : 0;

    duos.push({
      player1Id: m1.id,
      player2Id: m2.id,
      player1Name: `${m1.gameName}${m1.role ? ` (${m1.role})` : ''}`,
      player2Name: `${m2.gameName}${m2.role ? ` (${m2.role})` : ''}`,
      totalGames: ps.games,
      wins: ps.wins,
      losses: ps.losses,
      winrate,
      synergyRating: duoSynergyRating(winrate),
    });
  }

  duos.sort((a, b) => b.winrate - a.winrate);

  const status: DuoResult['status'] =
    errors.length === 0 ? 'ok' : duos.length > 0 ? 'partial' : 'error';

  return NextResponse.json({
    status,
    errors,
    duos,
    scannedMatches,
    membersAnalyzed: members.length,
  } as DuoResult);
}
