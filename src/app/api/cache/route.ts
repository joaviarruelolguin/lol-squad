import { NextResponse } from 'next/server';
import { connection } from 'next/server';
import { cache } from '@/lib/riot';
import { clearChampionCache } from '@/lib/ddragon';
import { clearSquadMatchCache } from '@/lib/squadMatches';
import { guardRead } from '@/lib/rateLimit';

export async function GET(req: Request) {
  await connection();

  const limited = guardRead(req, 'cache');
  if (limited) return limited;

  return NextResponse.json({
    cachedEntries: cache.size,
  });
}

/**
 * Vacía las cachés en memoria del servidor.
 *
 * Tiene guard por la misma razón que el resto: sin él, cualquiera que conociera
 * la URL podía vaciarla en loop y forzar al grupo entero a volver a pegarle a
 * Riot (que es el recurso más escaso del sistema).
 *
 * El catálogo de campeones y el conjunto de partidas normalizado también se
 * limpian: los dos derivan de respuestas de Riot y quedan cacheados toda la vida
 * del proceso.
 */
export async function DELETE(req: Request) {
  await connection();

  const limited = guardRead(req, 'cache');
  if (limited) return limited;

  cache.clear();
  clearChampionCache();
  clearSquadMatchCache();

  return NextResponse.json({ success: true, cachedEntries: 0 });
}
