import { NextResponse } from 'next/server';
import { connection } from 'next/server';
import { cache } from '@/lib/riot';
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
 * Vacía la caché en memoria de Riot.
 *
 * Tiene guard por la misma razón que el resto: sin él, cualquiera que conociera
 * la URL podía vaciarla en loop y forzar al grupo entero a volver a pegarle a
 * Riot (que es el recurso más escaso del sistema).
 */
export async function DELETE(req: Request) {
  await connection();

  const limited = guardRead(req, 'cache');
  if (limited) return limited;

  cache.clear();
  return NextResponse.json({ success: true, cachedEntries: 0 });
}
