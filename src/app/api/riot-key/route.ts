import { NextResponse } from 'next/server';
import { connection } from 'next/server';
import {
  getKeyMeta,
  setRiotKey,
  maskKey,
} from '@/lib/riotKey';
import { RiotApiError } from '@/lib/errors';
import { RiotApiClient, getRegionalRouting } from '@/lib/riot';
import { getSquadMembers } from '@/lib/storage';

const KEY_TTL_MS = 24 * 60 * 60 * 1000; // las keys de desarrollo duran 24h

export async function GET() {
  await connection();
  const meta = await getKeyMeta();

  if (!meta) {
    return NextResponse.json({
      configured: false,
      maskedKey: null,
      setAt: null,
      expiresAt: null,
      isExpired: true,
      ageHours: 0,
      remainingHours: 0,
    });
  }

  const setAt = new Date(meta.setAt);
  const expiresAt = new Date(setAt.getTime() + KEY_TTL_MS);
  const now = new Date();
  const ageHours = Math.max(0, (now.getTime() - setAt.getTime()) / 3_600_000);
  const remainingHours = Math.max(0, (expiresAt.getTime() - now.getTime()) / 3_600_000);
  const isExpired = now.getTime() >= expiresAt.getTime();

  return NextResponse.json({
    configured: true,
    maskedKey: maskKey(meta.key),
    setAt: meta.setAt,
    expiresAt: expiresAt.toISOString(),
    isExpired,
    ageHours: Math.round(ageHours * 10) / 10,
    remainingHours: Math.round(remainingHours * 10) / 10,
  });
}

export async function PUT(req: Request) {
  await connection();
  try {
    const body = await req.json();
    const { key } = body;

    if (!key || typeof key !== 'string') {
      return NextResponse.json({ error: 'Falta la API key' }, { status: 400 });
    }

    const trimmed = key.trim();
    if (!trimmed.startsWith('RGAPI-')) {
      return NextResponse.json(
        {
          error:
            'El formato no parece válido. Las keys de Riot empiezan con "RGAPI-".',
          errorType: 'INVALID_FORMAT',
        },
        { status: 400 }
      );
    }

    // Validar contra Riot: hacemos una consulta de prueba
    const client = new RiotApiClient(trimmed);
    const members = await getSquadMembers();
    let valid = false;
    let detail = '';

    if (members.length > 0 && members[0].puuid) {
      // Consulta real con un miembro existente
      try {
        await client.getLeagueEntriesByPuuid(
          members[0].puuid,
          members[0].region
        );
        valid = true;
      } catch (err) {
        if (err instanceof RiotApiError) {
          if (err.type === 'API_KEY_INVALID' || err.type === 'FORBIDDEN') {
            valid = false;
            detail = 'Riot rechazó la key (inválida o vencida).';
          } else if (err.type === 'NOT_FOUND') {
            // 404 = key válida, recurso no encontrado
            valid = true;
          } else {
            // Otros errores (rate limit, server) = key probablemente válida
            valid = true;
          }
        }
      }
    } else {
      // Sin miembros: validamos con una consulta genérica
      try {
        const routing = getRegionalRouting('la2');
        const url = `https://${routing}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/validacion-de-key`;
        const res = await fetch(url, {
          headers: { 'X-Riot-Token': trimmed },
        });
        if (res.status === 401 || res.status === 403) {
          valid = false;
          detail = 'Riot rechazó la key (inválida o vencida).';
        } else {
          valid = true; // 404 o 200 = key aceptada
        }
      } catch (err) {
        return NextResponse.json(
          { error: 'No se pudo contactar a Riot para validar.', errorType: 'NETWORK_ERROR' },
          { status: 502 }
        );
      }
    }

    if (!valid) {
      return NextResponse.json(
        { error: detail || 'La API key no es válida.', errorType: 'API_KEY_INVALID' },
        { status: 400 }
      );
    }

    const meta = await setRiotKey(trimmed);
    return NextResponse.json({
      success: true,
      message: 'API key guardada y verificada correctamente.',
      maskedKey: maskKey(meta.key),
      setAt: meta.setAt,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
