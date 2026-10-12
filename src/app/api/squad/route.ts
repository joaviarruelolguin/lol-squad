import { NextResponse } from 'next/server';
import { connection } from 'next/server';
import { getSquadMembers, saveSquadMember, removeSquadMember } from '@/lib/storage';
import { RiotApiClient, getRegionalRouting } from '@/lib/riot';
import { RiotApiError, ErrorInfo } from '@/lib/errors';
import { SquadMember, RiotRegion } from '@/lib/types';
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
function optionalEnum<T extends string>(  value: unknown,
  field: string,
  allowed: readonly T[]
): ValidationResult<T | undefined> {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: undefined };
  }
  return requireEnum(value, field, allowed);
}

/**
 * Shard hermano dentro de LATAM.
 *
 * Riot separa LATAM en dos: la1 (Chile, Perú, Argentina del sur...) y la2
 * (Brasil, Argentina del norte, México...). La cuenta se resuelve igual en los
 * dos, pero el Summoner solo existe en el shard que le toca. Si alguien de la1
 * se busca como la2, Riot devuelve 404 aunque la cuenta exista.
 */
const SIBLING_REGION: Partial<Record<RiotRegion, RiotRegion>> = {
  la1: 'la2',
  la2: 'la1',
};

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

    // Verificación obligatoria: NO guardamos nada que Riot no valide.
    //
    // Ojo con la diferencia entre las dos llamadas:
    //  - getAccountByRiotId va al routing regional (americas/europe) y
    //    devuelve la cuenta SIEMPRE que exista, sin importar el shard.
    //  - getSummonerByPuuid va al shard concreto (la1, la2, na1...) y da 404
    //    si el jugador está en otro.
    //
    // Sin esto, alguien de LATAM Sur (la1) guardado como la2 recibía el mismo
    // "no se encontró al invocador" que alguien que no existe, y no había
    // forma de distinguirlo ni de recuperarlo.
    let puuid: string;
    let profileIconId = 29;
    let summonerLevel = 1;
    let resolvedRegion: RiotRegion = region;

    try {
      const account = await client.getAccountByRiotId(gameName, tagLine, routing);
      puuid = account.puuid;
    } catch (err) {
      const info = toErrorInfo(err);
      return NextResponse.json(
        { error: info.message, errorType: info.type, code: info.code },
        { status: 400 }
      );
    }

    // La cuenta existe. Buscamos el summoner en el shard pedido y, si no está,
    // probamos el hermano de LATAM: es el error más común y se resuelve solo.
    const candidates: RiotRegion[] = [region];
    const sibling = SIBLING_REGION[region];
    if (sibling) candidates.push(sibling);

    for (const shard of candidates) {
      try {
        const summoner = await client.getSummonerByPuuid(puuid, shard);
        profileIconId = summoner.profileIconId;
        summonerLevel = summoner.summonerLevel;
        resolvedRegion = shard;
        break;
      } catch (err) {
        const isNotFound =
          err instanceof RiotApiError && err.type === 'NOT_FOUND';
        // 404 en el último candidato: no existe en ninguno de los shards.
        if (!isNotFound || shard === candidates[candidates.length - 1]) {
          const info = toErrorInfo(err);
          return NextResponse.json(
            {
              error:
                isNotFound
                  ? `Encontramos la cuenta ${gameName}#${tagLine}, pero no tiene Summoner en ${region.toUpperCase()} ni en ${sibling?.toUpperCase() ?? '-'}. Si es un jugador nuevo, puede que todavía no haya jugando ninguna partida.`
                  : info.message,
              errorType: info.type,
              code: info.code,
            },
            { status: 400 }
          );
        }
      }
    }

    if (resolvedRegion !== region) {
      console.info(
        `[squad] ${gameName}#${tagLine} no está en ${region}, se agregó desde ${resolvedRegion}`
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
      region: resolvedRegion,
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
