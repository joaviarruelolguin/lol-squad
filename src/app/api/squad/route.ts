import { NextResponse } from 'next/server';
import { connection } from 'next/server';
import { getSquadMembers, saveSquadMember, removeSquadMember } from '@/lib/storage';
import { RiotApiClient, getRegionalRouting } from '@/lib/riot';
import { RiotApiError, ErrorInfo } from '@/lib/errors';
import { SquadMember } from '@/lib/types';

export async function GET() {
  await connection();
  const members = await getSquadMembers();
  return NextResponse.json(members);
}

function toErrorInfo(err: unknown): ErrorInfo {
  if (err instanceof RiotApiError) return err.toInfo();
  if (err && typeof err === 'object' && 'type' in err && 'message' in err) {
    return err as ErrorInfo;
  }
  return {
    type: 'UNKNOWN',
    message: 'Error inesperado al agregar el invocador.',
    detail: String(err),
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { gameName, tagLine, nickname, role, region = 'la2' } = body;

    if (!gameName || !tagLine) {
      return NextResponse.json(
        { error: 'Faltan gameName o tagLine' },
        { status: 400 }
      );
    }

    const client = new RiotApiClient();
    const routing = getRegionalRouting(region);

    // Verificación obligatoria: NO guardamos nada que Riot no valide
    let puuid: string;
    let profileIconId: number;
    let summonerLevel: number;
    try {
      const account = await client.getAccountByRiotId(gameName, tagLine, routing);
      puuid = account.puuid;

      const summoner = await client.getSummonerByPuuid(puuid, region);
      profileIconId = summoner.profileIconId;
      summonerLevel = summoner.summonerLevel;
    } catch (err) {
      const info = toErrorInfo(err);
      return NextResponse.json(
        { error: info.message, errorType: info.type, code: info.code },
        { status: 400 }
      );
    }

    const newMember: SquadMember = {
      id: puuid,
      gameName,
      tagLine,
      nickname: nickname || gameName,
      role: role || 'FILL',
      puuid,
      profileIconId,
      summonerLevel,
      region,
      addedAt: new Date().toISOString(),
    };

    const updated = await saveSquadMember(newMember);
    return NextResponse.json({ success: true, member: newMember, members: updated });
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

    const updated = await removeSquadMember(id);
    return NextResponse.json({ success: true, members: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
