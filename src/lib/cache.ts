interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

/**
 * Caché en memoria con TTL para reducir llamadas a la API de Riot
 * y evitar golpes de rate limit al refrescar el dashboard.
 */
export class SimpleCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private defaultTtlMs: number;

  constructor(defaultTtlMs: number = 5 * 60 * 1000) {
    // TTL por defecto: 5 minutos
    this.defaultTtlMs = defaultTtlMs;
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.data;
  }

  set<T>(key: string, data: T, ttlMs?: number): void {
    const expiresAt = Date.now() + (ttlMs ?? this.defaultTtlMs);
    this.store.set(key, { data, expiresAt });
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  /** Cantidad de entradas vivas (útil para debug/estadísticas). */
  get size(): number {
    return this.store.size;
  }
}
