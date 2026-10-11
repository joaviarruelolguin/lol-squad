import { NextResponse } from 'next/server';
import { connection } from 'next/server';
import { getMatches, saveMatch, deleteMatch, computeTable } from '@/lib/customs';
import { CustomMatch } from '@/lib/types';
import { checkRateLimit, getClientIp, rateLimitResponse, LIMITS } from '@/lib/rateLimit';
import {
  readJson,
  requireString,
  requireStringArray,
  optionalString,
  optionalNumber,
  requireEnum,
  validationErrorResponse,
  type ValidationResult,
} from '@/lib/validate';

/** Enum opcional: si viene vacío, devuelve undefined */
function optionalEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[]
): ValidationResult<T | undefined> {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: undefined };
  }
  return requireEnum(value, field, allowed);
}

export async function GET() {
  await connection();
  const matches = await getMatches();
  const table = computeTable(matches);
  return NextResponse.json({ matches, table });
}

export async function POST(req: Request) {
  await connection();

  // Rate limit: registrar partidas es una acción de usuario
  const limited = rateLimitResponse(
    checkRateLimit(
      `customs:${getClientIp(req)}`,
      LIMITS.squadWrite.limit,
      LIMITS.squadWrite.windowMs
    )
  );
  if (limited) return limited;

  try {
    const parsed = await readJson(req);
    if (!parsed.ok) return validationErrorResponse(parsed);
    const body = parsed.value;

    const nameAR = requireString(body.teamAName, 'teamAName', { max: 40 });
    if (!nameAR.ok) return validationErrorResponse(nameAR);
    const nameBR = requireString(body.teamBName, 'teamBName', { max: 40 });
    if (!nameBR.ok) return validationErrorResponse(nameBR);

    const teamAR = requireStringArray(body.teamA, 'teamA', { maxItems: 10, maxLen: 128 });
    if (!teamAR.ok) return validationErrorResponse(teamAR);
    const teamBR = requireStringArray(body.teamB, 'teamB', { maxItems: 10, maxLen: 128 });
    if (!teamBR.ok) return validationErrorResponse(teamBR);

    const scoreAR = optionalNumber(body.scoreA, 'scoreA', { min: 0, max: 999 });
    if (!scoreAR.ok) return validationErrorResponse(scoreAR);
    const scoreBR = optionalNumber(body.scoreB, 'scoreB', { min: 0, max: 999 });
    if (!scoreBR.ok) return validationErrorResponse(scoreBR);

    const winnerR = optionalEnum(body.winner, 'winner', ['A', 'B'] as const);
    if (!winnerR.ok) return validationErrorResponse(winnerR);

    const mvpR = optionalString(body.mvpMemberId, 'mvpMemberId', { max: 128 });
    if (!mvpR.ok) return validationErrorResponse(mvpR);

    const notesR = optionalString(body.notes, 'notes', { max: 500 });
    if (!notesR.ok) return validationErrorResponse(notesR);

    const teamAName = nameAR.value;
    const teamBName = nameBR.value;
    const teamA = teamAR.value;
    const teamB = teamBR.value;
    const scoreA = scoreAR.value;
    const scoreB = scoreBR.value;
    const winner = winnerR.value;
    const mvpMemberId = mvpR.value;
    const notes = notesR.value;

    if (teamA.length === 0 || teamB.length === 0) {
      return NextResponse.json(
        { error: 'Cada equipo necesita al menos un jugador.' },
        { status: 400 }
      );
    }

    // Validación: no puede haber un jugador en ambos equipos
    const overlap = teamA.filter((p: string) => teamB.includes(p));
    if (overlap.length > 0) {
      return NextResponse.json(
        { error: 'Un jugador no puede estar en ambos equipos a la vez' },
        { status: 400 }
      );
    }

    const match: CustomMatch = {
      id: `match_${Date.now()}`,
      date: new Date().toISOString(),
      teamAName,
      teamBName,
      teamA,
      teamB,
      scoreA,
      scoreB,
      winner,
      mvpMemberId,
      notes,
    };

    const matches = await saveMatch(match);
    const table = computeTable(matches);
    return NextResponse.json({ success: true, match, matches, table });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  await connection();
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Falta ID' }, { status: 400 });
    }
    const matches = await deleteMatch(id);
    const table = computeTable(matches);
    return NextResponse.json({ success: true, matches, table });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
