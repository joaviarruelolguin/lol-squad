import { NextResponse } from 'next/server';
import { connection } from 'next/server';
import { getSquadMembers } from '@/lib/storage';
import { RiotApiClient, getRegionalRouting } from '@/lib/riot';
import { ErrorInfo } from '@/lib/errors';
import { SquadMember, CompositionResult, ChampCombo } from '@/lib/types';
import { guardRead } from '@/lib/rateLimit';

const MATCHES_PER_PLAYER = 20;
const MIN_GAMES = 2; // mínimo de partidas para que un combo sea confiable

// En match-v5 el campo `lane` trae: TOP / JUNGLE / MIDDLE / BOTTOM
const ROLE_MAP: Record<string, string> = {
  TOP: 'TOP',
  JUNGLE: 'JUNGLE',
  MIDDLE: 'MID',
  MID: 'MID',
  BOTTOM: 'ADC',
  BOT: 'ADC',
};

export async function GET(req: Request) {
  await connection();

  const limited = guardRead(req, 'composition');
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  // Opcional: ?members=id1,id2,id3 (para recomendar composición específica)
  const memberFilter = searchParams.get('members');

  const allMembers = await getSquadMembers();
  let members = allMembers.filter(
    (m): m is SquadMember & { puuid: string } => Boolean(m.puuid)
  );

  if (memberFilter) {
    const ids = new Set(memberFilter.split(',').filter(Boolean));
    const filtered = members.filter((m) => ids.has(m.id));
    if (filtered.length > 0) members = filtered;
  }

  const client = new RiotApiClient();
  const errors: ErrorInfo[] = [];

  if (members.length < 2) {
    return NextResponse.json({
      status: 'error' as const,
      errors: [{ type: 'NOT_FOUND' as const, message: 'Necesitamos al menos 2 miembros.' }],
      champCombos: [],
      roleFills: [],
      scannedMatches: 0,
    } as CompositionResult);
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
        440 // FLEX
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

  // Agregadores
  // 1. Combos de campeones (pares y tríos)
  const comboAgg = new Map<string, { wins: number; games: number }>();
  // 2. Rendimiento por rol
  const roleAgg = new Map<string, { wins: number; games: number }>();

  let scannedMatches = 0;

  for (const matchId of orderedMatchIds) {
    try {
      const detail = await client.getMatchDetail(matchId, defaultRouting);
      const info = detail?.info;
      if (!info || !Array.isArray(info.participants)) continue;

      const squadPlayers = info.participants.filter((p: any) => puuidToMember.has(p.puuid));
      if (squadPlayers.length < 2) continue;
      scannedMatches++;

      const squadWon = squadPlayers[0]?.win ?? false;

      // Combos de campeones del equipo de la squad (usar el equipo del jugador, no todos)
      const teamId = squadPlayers[0]?.teamId;
      const teamPlayers = info.participants.filter((p: any) => p.teamId === teamId);
      const champNames = teamPlayers
        .map((p: any) => p.championName)
        .filter(Boolean)
        .sort();

      // Pares
      for (let i = 0; i < champNames.length; i++) {
        for (let j = i + 1; j < champNames.length; j++) {
          const key = `${champNames[i]}+${champNames[j]}`;
          if (!comboAgg.has(key)) comboAgg.set(key, { wins: 0, games: 0 });
          const c = comboAgg.get(key)!;
          c.games++;
          if (squadWon) c.wins++;
        }
      }

      // Tríos (composición completa de 5 = firma)
      const teamKey = champNames.join('+');
      if (!comboAgg.has(teamKey)) comboAgg.set(teamKey, { wins: 0, games: 0 });
      const tk = comboAgg.get(teamKey)!;
      tk.games++;
      if (squadWon) tk.wins++;

      // Rol real: en match-v5 el campo `lane` trae la posición real
      for (const p of squadPlayers) {
        const lane = (p.lane || '').toUpperCase();
        const role = ROLE_MAP[lane] || 'FILL';
        if (!roleAgg.has(role)) roleAgg.set(role, { wins: 0, games: 0 });
        const r = roleAgg.get(role)!;
        r.games++;
        if (squadWon) r.wins++;
      }
    } catch {
      // ignorar
    }
  }

  // Construir combos con mínimo de partidas
  const champCombos: ChampCombo[] = [];
  for (const [key, data] of comboAgg) {
    if (data.games < MIN_GAMES) continue;
    const champs = key.split('+');
    champCombos.push({
      champions: champs,
      size: champs.length,
      wins: data.wins,
      games: data.games,
      winrate: Math.round((data.wins / data.games) * 100),
    });
  }
  // Ordenar por confianza: primero los combos con más partidas,
// después por winrate. Un 100% en 2 partidas no es confiable.
  champCombos.sort((a, b) => {
    if (b.games !== a.games) return b.games - a.games;
    return b.winrate - a.winrate;
  });

  // Roles con winrate
  const roleFills = [...roleAgg.entries()].map(([role, data]) => ({
    role,
    games: data.games,
    wins: data.wins,
    winrate: data.games > 0 ? Math.round((data.wins / data.games) * 100) : 0,
  })).sort((a, b) => b.games - a.games);

  return NextResponse.json({
    status: errors.length > 0 ? 'partial' : 'ok',
    errors,
    champCombos,
    roleFills,
    scannedMatches,
  } as CompositionResult);
}