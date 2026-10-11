'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseCachedFetchOptions {
  /** Clave única del recurso (ej: 'stats', 'duos') */
  key: string;
  /** Cuánto tiempo considerar fresco el dato (ms) */
  ttl?: number;
  /** Si debe cargar apenas se monta el componente */
  autoFetch?: boolean;
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
  { key, ttl = DEFAULT_TTL, autoFetch = true }: UseCachedFetchOptions
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

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(url);
      if (!res.ok) {
        // Si falla, mantenemos el dato viejo si lo había
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as T;
      const now = Date.now();
      store.set(key, { data: json, fetchedAt: now });
      setData(json);
      setFetchedAt(now);
      setTtlRemaining(ttl);
    } catch (err) {
      console.error(`[useCachedFetch:${key}]`, err);
      setError(
        err instanceof Error
          ? err.message
          : 'Error al cargar los datos'
      );
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [url, key, ttl]);

  // Cargar solo si no hay dato fresco
  useEffect(() => {
    if (!autoFetch) return;
    const cached = store.get(key);
    const isFresh = cached && Date.now() - cached.fetchedAt <= ttl;
    if (!isFresh) {
      load();
    } else {
      setTtlRemaining(ttl - (Date.now() - cached.fetchedAt));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, autoFetch]);

  // Contador regresivo de la caché
  useEffect(() => {
    if (!fetchedAt) return;
    const tick = () => {
      const remaining = ttl - (Date.now() - fetchedAt);
      setTtlRemaining(remaining > 0 ? remaining : null);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [fetchedAt, ttl]);

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

/** Limpia toda la caché de fetch (para el botón "Forzar") */
export function clearAllFetchCache(): void {
  store.clear();
}

/** Ver si algo está en caché y fresco */
export function isFresh(key: string, ttl: number): boolean {
  const cached = store.get(key);
  if (!cached) return false;
  return Date.now() - cached.fetchedAt <= ttl;
}

/** Fuerza a todos los hooks useCachedFetch a recargar */
const refreshListeners = new Set<() => void>();

export function registerRefreshListener(fn: () => void): () => void {
  refreshListeners.add(fn);
  return () => refreshListeners.delete(fn);
}

export function notifyAllRefresh(): void {
  for (const fn of refreshListeners) fn();
}