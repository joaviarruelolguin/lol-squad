import { NextResponse } from 'next/server';
import { connection } from 'next/server';
import { getMatches, saveMatch, deleteMatch, computeTable } from '@/lib/customs';
import { CustomMatch } from '@/lib/types';

export async function GET() {
  await connection();
  const matches = await getMatches();
  const table = computeTable(matches);
  return NextResponse.json({ matches, table });
}

export async function POST(req: Request) {
  await connection();
  try {
    const body = await req.json();
    const {
      teamAName,
      teamBName,
      teamA,
      teamB,
      scoreA,
      scoreB,
      winner,
      mvpMemberId,
      notes,
    } = body;

    if (!teamAName || !teamBName || !Array.isArray(teamA) || !Array.isArray(teamB)) {
      return NextResponse.json({ error: 'Faltan datos de equipos' }, { status: 400 });
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
