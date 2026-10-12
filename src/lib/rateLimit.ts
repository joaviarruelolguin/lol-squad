/**
 * Rate limiting en memoria para los endpoints POST.
 *
 * Sin esto, cualquiera que conozca la URL puede pegarle miles de requests
 * por minuto y comerse tu cuota de la API de Riot (que es el recurso
 * más escaso del sistema).
 *
 * Nota: en Vercel (serverless) cada lambda tiene su propia memoria, así que
 * este límite es "por instancia". Reduce el ruido de un atacante casual y
 * los bucles accidentales, pero no reemplaza un rate limiter global
 * (Upstash Redis) si la app crece.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Barro los buckets vencidos cada minuto. Antes la limpieza solo corria dentro de
// checkRateLimit y unicamente en la rama que crea un bucket nuevo: con muchas
// IPs distintas (NAT, proxies, usuarios en movil) el Map llegaba a 1000 entradas
// sin que la limpieza se llegara a disparar nunca, porque las peticiones
// siguientes siempre caian en la rama de "ya existe".
// unref() para que este timer no mantenga vivo el proceso en Node.
const sweep = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}, 60_000);

sweep.unref?.();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetInMs: number;
}

/**
 * @param key Identificador único (ej: `ai-chat:${ip}`)
 * @param limit Máximo de requests en la ventana
 * @param windowMs Tamaño de la ventana
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    // Limpieza periodica: la hace el timer de barrido de arriba.
    // El primer request también tiene que respetar el límite: con limit 0
    // esta función tiene que bloquear, no dejar pasar de a uno.
    return {
      ok: 1 <= limit,
      remaining: Math.max(0, limit - 1),
      resetInMs: windowMs,
    };
  }

  bucket.count++;
  const resetInMs = bucket.resetAt - now;

  return {
    ok: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    resetInMs,
  };
}

/** Obtiene la IP del request (best effort, funciona en Vercel y local) */
export function getClientIp(req: Request): string {
  const headers = req.headers;
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return headers.get('x-real-ip') || 'unknown';
}

/**
 * Helper para responder 429 con headers estándar.
 * Retorna null si el request está permitido.
 */
export function rateLimitResponse(result: RateLimitResult): Response | null {
  if (result.ok) return null;

  const retryAfter = Math.ceil(result.resetInMs / 1000);
  return new Response(
    JSON.stringify({
      error: 'Demasiadas consultas. Esperá un momento e intentá de nuevo.',
      errorType: 'RATE_LIMITED',
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(retryAfter),
      },
    }
  );
}

/** Límites recomendados por endpoint */
export const LIMITS = {
  aiChat: { limit: 10, windowMs: 60_000 },      // 10 mensajes/min por IP
  weeklyGenerate: { limit: 3, windowMs: 60_000 }, // 3 generaciones/min
  balance: { limit: 15, windowMs: 60_000 },      // 15 balanceos/min
  riotKey: { limit: 5, windowMs: 300_000 },     // 5 cambios de key/5min
  squadWrite: { limit: 10, windowMs: 60_000 },   // 10 escrituras/min
  // Lecturas. Vienen varias por carga de página (stats, duos, trios, métricas),
  // así que el límite es holgado: frena bucles y ataques casuales sin joder
  // al uso normal de 5 personas con varias pestañas abiertas.
  read: { limit: 60, windowMs: 60_000 },
} as const;

/**
 * Guard para los GET que llegan a Riot.
 *
 * Devuelve la respuesta 429 si hay que cortar, o `null` para seguir.
 * El bucket es por endpoint + IP, así que se permiten 60/min por ruta.
 */
export function guardRead(req: Request, scope: string): Response | null {
  return rateLimitResponse(
    checkRateLimit(
      `read:${scope}:${getClientIp(req)}`,
      LIMITS.read.limit,
      LIMITS.read.windowMs
    )
  );
}