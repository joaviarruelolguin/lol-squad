import { NextResponse } from 'next/server';
import { connection } from 'next/server';
import { getSquadMembers, saveSquadMember, removeSquadMember } from '@/lib/storage';
import { RiotApiClient, getRegionalRouting } from '@/lib/riot';
import { RiotApiError, ErrorInfo } from '@/lib/errors';
import { SquadMember } from '@/lib/types';
import { checkRateLimit, getClientIp, rateLimitResponse, LIMITS } from '@/lib/rateLimit';
import {
  readJson,
  requireString,
  optionalString,
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
  // Rate limit: escribir en la squad es raro
  const limited = rateLimitResponse(
    checkRateLimit(
      `squad:${getClientIp(req)}`,
      LIMITS.squadWrite.limit,
      LIMITS.squadWrite.windowMs
    )
  );
  if (limited) return limited;

  try {
    const parsed = await readJson(req);
    if (!parsed.ok) return validationErrorResponse(parsed);
    const body = parsed.value;

    const gameNameR = requireString(body.gameName, 'gameName', { max: 32 });
    if (!gameNameR.ok) return validationErrorResponse(gameNameR);

    const tagLineR = requireString(body.tagLine, 'tagLine', { max: 16 });
    if (!tagLineR.ok) return validationErrorResponse(tagLineR);

    const nicknameR = optionalString(body.nickname, 'nickname', { max: 60 });
    if (!nicknameR.ok) return validationErrorResponse(nicknameR);

    const regionR = requireEnum(body.region || 'la2', 'region', [
      'la1', 'la2', 'na1', 'br1', 'euw1',
    ] as const);
    if (!regionR.ok) return validationErrorResponse(regionR);

    const roleR = optionalEnum(body.role, 'role', [
      'TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT', 'FILL',
    ] as const);
    if (!roleR.ok) return validationErrorResponse(roleR);

    const gameName = gameNameR.value;
    const tagLine = tagLineR.value;
    const nickname = nicknameR.value;
    const role = roleR.value;
    const region = regionR.value;

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
