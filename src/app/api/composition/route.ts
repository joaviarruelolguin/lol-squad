import { NextResponse } from 'next/server';
import { connection } from 'next/server';
import { ErrorInfo } from '@/lib/errors';
import { CompositionResult, ChampCombo } from '@/lib/types';
import { getSquadMatchSet } from '@/lib/squadMatches';
import { guardRead } from '@/lib/rateLimit';

const MATCHES_PER_PLAYER = 20;
const FLEX_QUEUE = 440;
const MIN_GAMES = 2; // mínimo de partidas para que un combo sea confiable

/** Comparador de confianza: más partidas primero, después winrate. */
function sortByConfidence(a: { games: number; winrate: number }, b: { games: number; winrate: number }) {
  if (b.games !== a.games) return b.games - a.games;
  return b.winrate - a.winrate;
}

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

  // Historial Flex de la squad, compartido con duos, trends y player-metrics.
  // Solo se filtran los 2+ en la squad; el filtro por miembros se aplica
  // después, sobre los participantes ya normalizados.
  const squad = await getSquadMatchSet({
    matchesPerPlayer: MATCHES_PER_PLAYER,
    queue: FLEX_QUEUE,
    minSquadMembers: 2,
  });

  let members = squad.members;
  if (memberFilter) {
    const ids = new Set(memberFilter.split(',').filter(Boolean));
    const filtered = members.filter((m) => ids.has(m.id));
    if (filtered.length > 0) members = filtered;
  }

  const errors: ErrorInfo[] = squad.errors;

  if (members.length < 2) {
    return NextResponse.json({
      status: 'error' as const,
      errors: [{ type: 'NOT_FOUND' as const, message: 'Necesitamos al menos 2 miembros.' }],
      champCombos: [],
      roleFills: [],
      scannedMatches: 0,
    } as CompositionResult);
  }

  const memberIds = new Set(members.map((m) => m.id));

  // Agregadores
  // 1. Combos de campeones (pares y tríos)
  const comboAgg = new Map<string, { wins: number; games: number }>();
  // 2. Rendimiento por rol
  const roleAgg = new Map<string, { wins: number; games: number }>();

  let scannedMatches = 0;

  for (const match of squad.matches) {
    const squadPlayers = match.squadParticipants.filter((p) =>
      p.squadMemberId ? memberIds.has(p.squadMemberId) : false
    );
    if (squadPlayers.length < 2) continue;
    scannedMatches++;

    const squadWon = squadPlayers[0]?.win ?? false;

    // Combos de campeones del equipo de la squad (usar el equipo del jugador,
    // no el de toda la partida).
    const teamId = squadPlayers[0]?.teamId;
    const teamPlayers = match.participants.filter((p) => p.teamId === teamId);
    const champNames = teamPlayers
      .map((p) => p.championName)
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

    // Rol real: en match-v5 el campo lane trae la posición real
    for (const p of squadPlayers) {
      const lane = (p.lane || '').toUpperCase();
      const role = ROLE_MAP[lane] || 'FILL';
      if (!roleAgg.has(role)) roleAgg.set(role, { wins: 0, games: 0 });
      const r = roleAgg.get(role)!;
      r.games++;
      if (squadWon) r.wins++;
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

  // Ordenar por confianza: primero los combos con más partidas, después por
  // winrate. Un 100% en 2 partidas no es confiable.
  champCombos.sort((a, b) => sortByConfidence(a, b));

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