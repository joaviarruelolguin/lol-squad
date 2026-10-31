import { getSupabase, isSupabaseConfigured } from './supabase';
import { RiotApiClient } from './riot';
import { routingFromMatchId, sortByRecency } from './matchId';
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
  // Detalle cacheado pero sin timeline.
  //
  // No entra en `missing`: el detalle ya lo tenemos, solo falta pagar el request
  // del timeline. Antes devolvíamos `timeline: null` y listo, y eso dejó la
  // timeline del chat (LaneDiffPanel) rota de forma permanente en producción:
  // /api/weekly y /api/flex-matches cargan primero con withTimeline=false, así
  // que guardan todas las partidas sin timeline, y cuando después el chat
  // pedía una de esas, la fila ya existía y nunca más se volvía a preguntar a
  // Riot. Devolvía 400 "La partida no tiene timeline disponible." para partidas
  // que Riot tenía perfectamente.
  const missingTimeline: string[] = [];

  for (const id of uniqueIds) {
    const row = cacheMap.get(id);
    if (row?.detail) {
      const detail = typeof row.detail === 'string' ? JSON.parse(row.detail) : row.detail;
      let timeline = null;
      if (withTimeline) {
        if (row.timeline) {
          timeline = typeof row.timeline === 'string' ? JSON.parse(row.timeline) : row.timeline;
        } else {
          missingTimeline.push(id);
        }
      }
      results.push({ matchId: id, info: detail?.info || detail, timeline });
    } else {
      missing.push(id);
    }
  }

  // Las que faltan van a Riot, con concurrencia limitada para no comerse el rate limit
  const before = results.length;
  await runBatched(missing);

  // Rellenar los timelines que faltaban sobre partidas ya cacheadas.
  //
  // Mismo lote que arriba: el limiter global es el que reparte, esto solo evita
  // que todas las esperas se acumulen en serie.
  const timelineById = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < missingTimeline.length; i += concurrency) {
    const batch = missingTimeline.slice(i, i + concurrency);
    const fetched = await Promise.allSettled(
      batch.map(async (id) => ({
        id,
        timeline: await client.getMatchTimeline(id, routingFor(id)),
      }))
    );
    for (const f of fetched) {
      if (f.status === 'fulfilled' && f.value?.timeline) {
        timelineById.set(f.value.id, f.value.timeline);
      }
    }
  }

  // `results` ya tiene la partida con timeline en null: hay que pisarlo.
  for (const m of results) {
    const tl = timelineById.get(m.matchId);
    if (tl) m.timeline = tl;
  }

  const now = new Date().toISOString();

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
      fetched_at: now,
    };
    if (m.timeline) row.timeline = { info: m.timeline.info };
    return row;
  });

  // Partidas que ya estaban y a las que solo les sumamos el timeline.
  //
  // Se manda el detalle igual aunque lo tengamos: el upsert reemplaza las
  // columnas que viajan, y mandar solo `timeline` dejaría el resto suelto.
  for (const id of missingTimeline) {
    const tl = timelineById.get(id);
    if (!tl) continue;
    const m = results.find((r) => r.matchId === id);
    toStore.push({
      match_id: id,
      detail: { info: m?.info },
      timeline: { info: tl.info },
      fetched_at: now,
    });
  }

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

export interface RecentMatchesResult {
  /** Partidas con gameCreation >= since, de más reciente a más antigua. */
  matches: CachedMatch[];
  /** Cuántos IDs terminamos mirando. */
  scanned: number;
  /** Cortamos antes de agotar la lista: ya pasamos la ventana. */
  stoppedEarly: boolean;
}

/**
 * Trae solo las partidas dentro de una ventana temporal, parando de bajar
 * detalles cuando ya se pasó.
 *
 * La secuencia del match ID es monotónica pero NO es un timestamp, así que no
 * permite saber la fecha sin pedir el detalle. Lo que sí permite es ordenar. La
 * estrategia es entonces: ordenar de más reciente a más antigua, traer el
 * detalle por tandas, y cortar en la primera tanda donde aparecen partidas
 * viejas. Con una ventana de una semana eso baja de ~40 requests a ~5, sin
 * inventarse fechas.
 *
 * `maxMatches` es el presupuesto: si el filtro de fechas no sirve para nada
 * (partidas que no se cargan, o una squad que no juega hace meses) el corte por
 * fecha puede no activarse nunca, y sin tope estaríamos bajando el historial
 * entero.
 */
export async function getRecentMatchesWithCache(
  matchIds: string[],
  since: number,
  routing: RegionalRouting,
  options: { chunkSize?: number; maxMatches?: number } = {}
): Promise<RecentMatchesResult> {
  const chunkSize = options.chunkSize ?? 8;
  const maxMatches = options.maxMatches ?? 60;

  const ordered = sortByRecency([...new Set(matchIds)]);

  const inWindow: CachedMatch[] = [];
  let scanned = 0;

  for (let i = 0; i < ordered.length; i += chunkSize) {
    if (inWindow.length >= maxMatches) {
      return { matches: inWindow, scanned, stoppedEarly: true };
    }

    const chunk = ordered.slice(i, i + chunkSize);
    const fetched = await getMatchesWithCache(chunk, routing, false, 2);
    scanned += chunk.length;

    // De la tanda anterior a esta ya no puede haber más partidas nuevas.
    let consecutiveOld = 0;
    for (const match of fetched) {
      const created = match.info?.gameCreation ?? 0;
      if (created >= since) {
        inWindow.push(match);
        consecutiveOld = 0;
      } else {
        // Las que no pudimos cargar no cuentan como viejas: pueden ser justo las
    // que están en la ventana y no queremos cortar por un 404.
        if (created > 0) consecutiveOld++;
      }
    }

    // Pedimos 3 followed: como el orden viene de una secuencia global, puede
    // haber algún desajuste entre shards. Con un par de partidas viejas seguidas
    // ya estamos seguros de que pasamos la ventana.
    if (consecutiveOld >= 3) {
      return { matches: inWindow, scanned, stoppedEarly: true };
    }
  }

  return { matches: inWindow, scanned, stoppedEarly: false };
}