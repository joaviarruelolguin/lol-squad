import { NextResponse } from 'next/server';
import { connection } from 'next/server';
import { getSquadMembers } from '@/lib/storage';
import { RiotApiClient, getRegionalRouting } from '@/lib/riot';
import { RiotApiError, ErrorInfo } from '@/lib/errors';
import { DuoStat } from '@/lib/types';
import { duoSynergyRating } from '@/lib/synergy';
import { guardRead } from '@/lib/rateLimit';

export interface DuoResult {
  status: 'ok' | 'partial' | 'error';
  errors: ErrorInfo[];
  duos: DuoStat[];
  scannedMatches: number;
  membersAnalyzed: number;
}

const MATCHES_PER_PLAYER = 20; // últimas N partidas a escanear

function toErrorInfo(err: unknown): ErrorInfo {
  if (err instanceof RiotApiError) return err.toInfo();
  if (err && typeof err === 'object' && 'type' in err && 'message' in err) {
    return err as ErrorInfo;
  }
  return {
    type: 'UNKNOWN',
    message: 'Error inesperado al analizar partidas.',
    detail: String(err),
  };
}

function synergyRating(winrate: number): DuoStat['synergyRating'] {
  return duoSynergyRating(winrate);
}

export async function GET(req: Request) {
  await connection();

  const limited = guardRead(req, 'duos');
  if (limited) return limited;
  const allMembers = await getSquadMembers();
  const members = allMembers.filter((m) => m.puuid);
  const client = new RiotApiClient();

  const errors: ErrorInfo[] = [];

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

  // --- Paso 1: obtener IDs de últimas partidas FLEX de cada miembro ---
  // matchId -> Set<puuid> de miembros de la squad que jugaron esa partida
  const matchToPuuids = new Map<string, Set<string>>();
  const FLEX_QUEUE = 440; // RANKED_FLEX_SR

  for (const member of members) {
    try {
      const routing = getRegionalRouting(member.region);
      const ids = await client.getMatchIdsByPuuid(
        member.puuid!,
        routing,
        MATCHES_PER_PLAYER,
        FLEX_QUEUE
      );
      for (const id of ids) {
        if (!matchToPuuids.has(id)) matchToPuuids.set(id, new Set());
        matchToPuuids.get(id)!.add(member.puuid!);
      }
    } catch (err) {
      errors.push(toErrorInfo(err));
    }
  }

  // --- Paso 2: solo partidas con 2+ miembros de la squad ---
  const sharedMatches = [...matchToPuuids.entries()].filter(
    ([, puuids]) => puuids.size >= 2
  );

  // --- Paso 3: para cada partida compartida, buscar quién ganó ---
  // clave de pareja "puuidA|puuidB" (ordenados) -> { wins, losses, games }
  const pairStats = new Map<string, { wins: number; losses: number; games: number }>();
  let scannedMatches = 0;
  const defaultRouting = getRegionalRouting(members[0]?.region ?? 'la2');

  for (const [matchId, puuids] of sharedMatches) {
    try {
      // routing: usamos el de la región del primer miembro (todos deberían ser de la misma squad)
      const routing = defaultRouting;
      const detail = await client.getMatchDetail(matchId, routing);
      scannedMatches++;

      // mapa puuid -> ganó?
      const puuidWin = new Map<string, boolean>();
      for (const p of detail?.info?.participants || []) {
        if (p.puuid) puuidWin.set(p.puuid, Boolean(p.win));
      }

      const arr = [...puuids];
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const a = arr[i];
          const b = arr[j];
          const key = [a, b].sort().join('|');
          if (!pairStats.has(key)) pairStats.set(key, { wins: 0, losses: 0, games: 0 });
          const ps = pairStats.get(key)!;
          ps.games++;

          const winA = puuidWin.get(a);
          const winB = puuidWin.get(b);
          // Solo contabilizamos si ambos estaban en el mismo resultado
          // (mismo equipo): ambos ganaron o ambos perdieron
          if (winA === winB && winA !== undefined) {
            if (winA) ps.wins++;
            else ps.losses++;
          }
        }
      }
    } catch (err) {
      // No podemos leer el detalle de esta partida; la saltamos
      // (no inventamos resultado)
      errors.push(toErrorInfo(err));
    }
  }

  // --- Paso 4: armar el resultado por pareja ---
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
      synergyRating: synergyRating(winrate),
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
