interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

/**
 * Caché en memoria con TTL para reducir llamadas a la API de Riot
 * y evitar golpes de rate limit al refrescar el dashboard.
 *
 * Es genérica para que el llamador declare qué guarda y no castear en cada
 * `get`. `new SimpleCache()` sin parámetro sigue siendo `unknown`, así que los
 * usos existentes no cambian.
 *
 * Además tiene tope de tamaño. Antes el Map crecía sin límite: `get()` solo
 * purgaba la key que estaba leyendo, así que las entradas vencidas de las demás
 * quedaban para siempre. Con `TTL.matchDetail` de 24h y ~100 partidas nuevas por
 * día, en una instancia de larga vida eso es un leak real.
 */
export class SimpleCache<T = unknown> {
  private store = new Map<string, CacheEntry<T>>();
  private defaultTtlMs: number;
  private maxSize: number;

  constructor(defaultTtlMs: number = 5 * 60 * 1000, maxSize: number = 1000) {
    // TTL por defecto: 5 minutos
    this.defaultTtlMs = defaultTtlMs;
    this.maxSize = maxSize;
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.data;
  }

  set(key: string, data: T, ttlMs?: number): void {
    // Barrido antes de insertar, no después: así no entra una entrada nueva
    // para que el siguiente set la eyecte.
    if (this.store.size >= this.maxSize) this.evict();
    const expiresAt = Date.now() + (ttlMs ?? this.defaultTtlMs);
    this.store.set(key, { data, expiresAt });
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  /**
   * Libera memoria: primero tira todo lo vencido y, si todavía excede el tope,
   * expulsa las entradas que vencen antes.
   */
  private evict(): void {
    const now = Date.now();

    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key);
    }

    while (this.store.size >= this.maxSize) {
      let victim: string | undefined;
      let earliest = Infinity;
      for (const [key, entry] of this.store) {
        if (entry.expiresAt < earliest) {
          earliest = entry.expiresAt;
          victim = key;
        }
      }
      // Map vacío: no hay nada más que expulsar.
      if (victim === undefined) break;
      this.store.delete(victim);
    }
  }

  /** Cantidad de entradas vivas (útil para debug/estadísticas). */
  get size(): number {
    return this.store.size;
  }
}
