import { getSupabase, isSupabaseConfigured } from './supabase';
import { RiotApiClient } from './riot';
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
export async function getMatchWithCache(
  matchId: string,
  routing: RegionalRouting,
  withTimeline = false
): Promise<CachedMatch | null> {
  if (!isSupabaseConfigured()) {
    const client = new RiotApiClient();
    const detail = await client.getMatchDetail(matchId, routing);
    if (!detail?.info) return null;
    let timeline = null;
    if (withTimeline) {
      try {
        timeline = await client.getMatchTimeline(matchId, routing);
      } catch {
        timeline = null;
      }
    }
    return { matchId, info: detail.info, timeline };
  }

  const supabase = getSupabase();

  // 1. Buscar en caché
  const { data: cached } = await supabase
    .from('match_cache')
    .select('match_id, detail, timeline')
    .eq('match_id', matchId)
    .maybeSingle();

  if (cached) {
    const detail = typeof cached.detail === 'string' ? JSON.parse(cached.detail) : cached.detail;
    if (detail) {
      let timeline = null;
      if (withTimeline) {
        timeline = typeof cached.timeline === 'string' ? JSON.parse(cached.timeline) : cached.timeline;
      }
      return { matchId, info: detail?.info || detail, timeline };
    }
  }

  // 2. No está en caché: pedir a Riot y guardar
  const client = new RiotApiClient();
  const detail = await client.getMatchDetail(matchId, routing);
  if (!detail?.info) return null;

  let timeline = null;
  if (withTimeline) {
    try {
      timeline = await client.getMatchTimeline(matchId, routing);
    } catch {
      timeline = null;
    }
  }

  // 3. Persistir para no volver a pedirlo
  try {
    await supabase.from('match_cache').upsert(
      {
        match_id: matchId,
        detail,
        timeline: timeline ? { info: timeline.info } : null,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: 'match_id' }
    );
  } catch (err) {
    // Si falla el guardado, seguimos igual (solo perdemos caché, no datos)
    console.warn('match_cache upsert failed:', err);
  }

  return { matchId, info: detail.info, timeline };
}

/**
 * Igual que getMatchWithCache pero para varias partidas.
 * Las que ya están en caché se resuelven sin tocar Riot.
 */
export async function getMatchesWithCache(
  matchIds: string[],
  routing: RegionalRouting,
  withTimeline = false,
  concurrency = 3
): Promise<CachedMatch[]> {
  if (!isSupabaseConfigured()) {
    const out: CachedMatch[] = [];
    for (const id of matchIds) {
      try {
        const r = await getMatchWithCache(id, routing, withTimeline);
        if (r) out.push(r);
      } catch {
        continue;
      }
    }
    return out;
  }

  const supabase = getSupabase();

  // Pedir todos los match_ids de una vez
  const { data: rows } = await supabase
    .from('match_cache')
    .select('match_id, detail, timeline')
    .in('match_id', matchIds);

  const cacheMap = new Map<string, any>();
  for (const row of rows || []) {
    cacheMap.set(row.match_id, row);
  }

  const client = new RiotApiClient();
  const results: CachedMatch[] = [];
  const missing: string[] = [];

  for (const id of matchIds) {
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
  for (let i = 0; i < missing.length; i += concurrency) {
    const batch = missing.slice(i, i + concurrency);
    const fetched = await Promise.allSettled(
      batch.map(async (id) => {
        const detail = await client.getMatchDetail(id, routing);
        if (!detail?.info) return null;
        let timeline = null;
        if (withTimeline) {
          try {
            timeline = await client.getMatchTimeline(id, routing);
          } catch {
            timeline = null;
          }
        }
        return { matchId: id, info: detail.info, timeline };
      })
    );

    const toStore: any[] = [];
    for (const f of fetched) {
      if (f.status === 'fulfilled' && f.value) {
        results.push(f.value);
        toStore.push({
          match_id: f.value.matchId,
          detail: { info: f.value.info },
          timeline: f.value.timeline ? { info: f.value.timeline.info } : null,
          fetched_at: new Date().toISOString(),
        });
      }
    }

    if (toStore.length > 0) {
      try {
        await supabase.from('match_cache').upsert(toStore, { onConflict: 'match_id' });
      } catch {
        // no es crítico
      }
    }
  }

  // Preservar el orden original
  const order = new Map(matchIds.map((id, i) => [id, i]));
  results.sort((a, b) => (order.get(a.matchId) ?? 0) - (order.get(b.matchId) ?? 0));

  return results;
}

/** Estadísticas de la caché (para mostrarlas en la UI) */
export async function getCacheStats(): Promise<{
  totalMatches: number;
  oldestFetch: string | null;
  newestFetch: string | null;
}> {
  if (!isSupabaseConfigured()) {
    return { totalMatches: 0, oldestFetch: null, newestFetch: null };
  }
  try {
    const { count } = await getSupabase()
      .from('match_cache')
      .select('match_id', { count: 'exact', head: true });

    const { data } = await getSupabase()
      .from('match_cache')
      .select('fetched_at')
      .order('fetched_at', { ascending: true })
      .limit(1);

    const { data: newest } = await getSupabase()
      .from('match_cache')
      .select('fetched_at')
      .order('fetched_at', { ascending: false })
      .limit(1);

    return {
      totalMatches: count || 0,
      oldestFetch: data?.[0]?.fetched_at || null,
      newestFetch: newest?.[0]?.fetched_at || null,
    };
  } catch {
    return { totalMatches: 0, oldestFetch: null, newestFetch: null };
  }
}