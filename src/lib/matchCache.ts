import { getSupabase, isSupabaseConfigured } from './supabase';
import { RiotApiClient } from './riot';
import { routingFromMatchId } from './matchId';
import { RegionalRouting } from './types';

interface CachedMatch {
  matchId: string;
  info: any;
  timeline: any | null;
}

/**
 * Caché persistente de partidas en Supabase.
 *
 * Riot tiene rate limits estrictos (2 req/seg en dev). Guardar el detalle
 * de cada partida en nuestra base significa que solo consultamos a Riot
 * las partidas que aún no tenemos, y el resto se resuelve localmente.
 *
 * Sin Supabase configurado, funciona como passthrough (solo caché en memoria
 * del RiotApiClient).
 */
export async function getMatchesWithCache(
  matchIds: string[],
  routing: RegionalRouting,
  withTimeline = false,
  // 2 y no 3: el límite de Riot es 2 req/s con burst 2. Con 3 requests en
  // vuelo nos pasamos del burst, Riot responde 429, se agotan los reintentos
  // y las partidas se pierden en silencio (scanned=35 en lugar de 38).
  concurrency = 2
): Promise<CachedMatch[]> {
  const client = new RiotApiClient();
  const results: CachedMatch[] = [];

  // Dedupe defensivo: los endpoints ya filtran repetidos, pero con 5 jugadores
  // compartiendo partidas es fácil que se cuele uno y termine pidiendo dos
  // veces lo mismo.
  const uniqueIds = [...new Set(matchIds)];

  // Cada partida se pide con el routing de SU prefijo, no con el que pasó el
  // llamador (que era el del primer miembro de la squad). Con un jugador de
  // EUW1 en el grupo, pedir su `EUW1_...` a `americas` da 404, se agotan los
  // reintentos y la partida desaparece en silencio del análisis.
  const routingFor = (id: string): RegionalRouting => routingFromMatchId(id) || routing;

  // Sin Supabase no hay caché persistente, pero igual conviene pedir en
  // lote con concurrencia acotada: el limiter global serializa a 2 req/s,
  // pero las esperas se solapan y no pagamos el reintento uno por uno.
  const fetchOne = async (id: string): Promise<CachedMatch | null> => {
    const route = routingFor(id);
    const detail = await client.getMatchDetail(id, route);
    if (!detail?.info) return null;
    let timeline = null;
    if (withTimeline) {
      try {
        timeline = await client.getMatchTimeline(id, route);
      } catch {
        timeline = null;
      }
    }
    return { matchId: id, info: detail.info, timeline };
  };

  const runBatched = async (ids: string[]) => {
    for (let i = 0; i < ids.length; i += concurrency) {
      const batch = ids.slice(i, i + concurrency);
      const fetched = await Promise.allSettled(batch.map(fetchOne));
      for (const f of fetched) {
        if (f.status === 'fulfilled' && f.value) results.push(f.value);
      }
    }
  };

  if (!isSupabaseConfigured()) {
    await runBatched(uniqueIds);
    return orderBy(uniqueIds, results);
  }

  const supabase = getSupabase();

  // Pedir todos los match_ids de una vez
  const { data: rows } = await supabase
    .from('match_cache')
    .select('match_id, detail, timeline')
    .in('match_id', uniqueIds);

  const cacheMap = new Map<string, any>();
  for (const row of rows || []) {
    cacheMap.set(row.match_id, row);
  }

  const missing: string[] = [];

  for (const id of uniqueIds) {
    const row = cacheMap.get(id);
    if (row?.detail) {
      const detail = typeof row.detail === 'string' ? JSON.parse(row.detail) : row.detail;
      let timeline = null;
      if (withTimeline && row.timeline) {
        timeline = typeof row.timeline === 'string' ? JSON.parse(row.timeline) : row.timeline;
      }
      results.push({ matchId: id, info: detail?.info || detail, timeline });
    } else {
      missing.push(id);
    }
  }

  // Las que faltan van a Riot, con concurrencia limitada para no comerse el rate limit
  const before = results.length;
  await runBatched(missing);

  // Persistir las que acabamos de traer.
  //
  // Nunca escribimos `timeline: null`: /api/trends pide las partidas con
  // timeline y /api/weekly las pide sin. Si corren en paralelo y la segunda
  // escribe última, borra el timeline que la primera recién cacheó, y la
  // próxima vez que Trends abra se vuelve a pagar el request.
  const toStore = results.slice(before).map((m) => {
    const row: Record<string, unknown> = {
      match_id: m.matchId,
      detail: { info: m.info },
      fetched_at: new Date().toISOString(),
    };
    if (m.timeline) row.timeline = { info: m.timeline.info };
    return row;
  });

  if (toStore.length > 0) {
    try {
      await supabase.from('match_cache').upsert(toStore, { onConflict: 'match_id' });
    } catch {
      // no es crítico
    }
  }

  return orderBy(uniqueIds, results);
}

/** Preserva el orden original de matchIds en los resultados */
function orderBy(matchIds: string[], results: CachedMatch[]): CachedMatch[] {
  const order = new Map(matchIds.map((id, i) => [id, i]));
  return results.sort(
    (a, b) => (order.get(a.matchId) ?? 0) - (order.get(b.matchId) ?? 0)
  );
}