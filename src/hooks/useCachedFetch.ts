'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseCachedFetchOptions {
  /** Clave única del recurso (ej: 'stats', 'duos') */
  key: string;
  /** Cuánto tiempo considerar fresco el dato (ms) */
  ttl?: number;
  /** Si debe cargar apenas se monta el componente */
  autoFetch?: boolean;
  /**
   * Pedir que el hook lleve la cuenta regresiva de la caché.
   *
   * Viene opt-in porque mantenerla cuesta un `setInterval`: sin esto, los tres
   * paneles de Sinergia (TrendsPanel, TrioPanel, CompositionPanel) se
   * re-renderizaban a 1 Hz con ~50 filas en el DOM, y ninguno leía el valor.
   */
  countdown?: boolean;
}

interface UseCachedFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Fuerza recarga ignorando la caché */
  refresh: () => Promise<void>;
  /** Marca el dato como viejo y vuelve a traerlo */
  invalidate: () => void;
  /** Timestamp de la última carga */
  fetchedAt: number | null;
  /** Cuánto falta para que venza la caché (ms), null si ya venció */
  ttlRemaining: number | null;
}

/**
 * Cache de fetch en memoria (por sesión de pestaña).
 *
 * Evita que al cambiar de pestaña se vuelvan a pedir datos que ya tenemos.
 * Los datos se consideran frescos durante `ttl` y después hay que pedir de nuevo
 * con `refresh()`.
 */
const store = new Map<string, { data: unknown; fetchedAt: number }>();

const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutos

export function useCachedFetch<T>(
  url: string,
  { key, ttl = DEFAULT_TTL, autoFetch = true, countdown = false }: UseCachedFetchOptions
): UseCachedFetchResult<T> {
  const [data, setData] = useState<T | null>(() => {
    const cached = store.get(key);
    if (!cached) return null;
    if (Date.now() - cached.fetchedAt > ttl) return null;
    return cached.data as T;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(
    () => store.get(key)?.fetchedAt ?? null
  );
  const [ttlRemaining, setTtlRemaining] = useState<number | null>(null);

  // Evitar condiciones de carrera en StrictMode
  const inFlight = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);

    // Abortar el fetch anterior: si el usuario aprieta "Actualizar" dos veces o
    // cambia de pestaña rápido, el pedido viejo se completaba y se parseaba
    // entero para terminar descartado.
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) {
        // Si falla, mantenemos el dato viejo si lo había
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as T;
      const now = Date.now();
      store.set(key, { data: json, fetchedAt: now });
      setData(json);
      setFetchedAt(now);
      if (countdown) setTtlRemaining(ttl);
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      console.error(`[useCachedFetch:${key}]`, err);
      setError(
        err instanceof Error
          ? err.message
          : 'Error al cargar los datos'
      );
    } finally {
      if (!ctrl.signal.aborted) {
        inFlight.current = false;
        setLoading(false);
      }
    }
  }, [url, key, ttl, countdown]);

  // Cancelar el pedido en vuelo si el componente se desmonta.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Suscribirse a las recargas forzadas (botón "Forzar"). Sin esto, limpiar el
  // store no llega al componente: el hook ya tenía el dato y no volvía a mirar.
  useEffect(() => registerRefreshListener(() => load()), [load]);

  // Cargar solo si no hay dato fresco
  useEffect(() => {
    if (!autoFetch) return;
    const cached = store.get(key);
    const isFresh = cached && Date.now() - cached.fetchedAt <= ttl;
    if (!isFresh) {
      load();
    } else if (countdown) {
      setTtlRemaining(ttl - (Date.now() - cached.fetchedAt));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, autoFetch]);

  // Contador regresivo de la caché. Solo si lo pidió quien usa el hook.
  useEffect(() => {
    if (!countdown || !fetchedAt) return;
    const tick = () => {
      const remaining = ttl - (Date.now() - fetchedAt);
      setTtlRemaining(remaining > 0 ? remaining : null);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [fetchedAt, ttl, countdown]);

  const refresh = useCallback(async () => {
    store.delete(key);
    await load();
  }, [key, load]);

  const invalidate = useCallback(() => {
    store.delete(key);
    setTtlRemaining(null);
  }, [key]);

  return { data, loading, error, refresh, invalidate, fetchedAt, ttlRemaining };
}

/**
 * Limpia toda la caché de fetch (para el botón "Forzar") y avisa a los hooks
 * ya montados.
 *
 * Antes solo borraba el store, así que si estabas en la pestaña Sinergia el
 * botón "Forzar" no recarga TrendsPanel/TrioPanel/CompositionPanel: sus hooks
 * ya tenían el dato en memoria y nunca volvían a mirar el store.
 */
export function clearAllFetchCache(): void {
  store.clear();
  notifyAllRefresh();
}

/** Ver si algo está en caché y fresco */
export function isFresh(key: string, ttl: number): boolean {
  const cached = store.get(key);
  if (!cached) return false;
  return Date.now() - cached.fetchedAt <= ttl;
}

/**
 * Hooks montados que quieren enterarse de una recarga forzada.
 *
 * `notifyAllRefresh` se llama desde `clearAllFetchCache` (arriba), y las
 * funciones `export function` se hoistean, así que el orden no importa acá.
 */
const refreshListeners = new Set<() => void>();

export function registerRefreshListener(fn: () => void): () => void {
  refreshListeners.add(fn);
  return () => refreshListeners.delete(fn);
}

/** Fuerza a todos los hooks useCachedFetch a recargar */
export function notifyAllRefresh(): void {
  for (const fn of refreshListeners) fn();
}