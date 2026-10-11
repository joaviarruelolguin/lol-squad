import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  LIMITS,
} from '@/lib/rateLimit';

/**
 * El bucket es un Map a nivel de módulo, así que cada test necesita una key
 * propia (o limpiar el reloj) para no depender del orden de ejecución.
 * Uso un contador incremental: las keys no se solapan nunca entre tests.
 */
let seq = 0;
const uniqueKey = (label: string) => `${label}:${seq++}`;

describe('checkRateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('permite el primer request siempre', () => {
    const r = checkRateLimit(uniqueKey('t1'), 10, 60_000);
    expect(r.ok).toBe(true);
    expect(r.remaining).toBe(9);
  });

  it('va descontando remaining hasta agotar el límite', () => {
    const key = uniqueKey('t2');
    expect(checkRateLimit(key, 3, 60_000).remaining).toBe(2);
    expect(checkRateLimit(key, 3, 60_000).remaining).toBe(1);
    expect(checkRateLimit(key, 3, 60_000).remaining).toBe(0);
  });

  it('bloquea recién en el request que excede el límite', () => {
    const key = uniqueKey('t3');
    // límite 3: los 3 primeros entran, el 4º se rechaza
    expect(checkRateLimit(key, 3, 60_000).ok).toBe(true);
    expect(checkRateLimit(key, 3, 60_000).ok).toBe(true);
    expect(checkRateLimit(key, 3, 60_000).ok).toBe(true);
    expect(checkRateLimit(key, 3, 60_000).ok).toBe(false);
  });

  it('sigue bloqueando mientras la ventana está abierta', () => {
    const key = uniqueKey('t4');
    for (let i = 0; i < 2; i++) checkRateLimit(key, 2, 60_000);
    vi.advanceTimersByTime(59_000);
    expect(checkRateLimit(key, 2, 60_000).ok).toBe(false);
  });

  it('resetea la ventana una vez vencida', () => {
    const key = uniqueKey('t5');
    for (let i = 0; i < 3; i++) checkRateLimit(key, 2, 60_000);
    expect(checkRateLimit(key, 2, 60_000).ok).toBe(false);

    vi.advanceTimersByTime(60_001);

    const r = checkRateLimit(key, 2, 60_000);
    expect(r.ok).toBe(true);
    expect(r.remaining).toBe(1);
  });

  it('resetInMs cuenta para atrás dentro de la ventana', () => {
    const key = uniqueKey('t6');
    checkRateLimit(key, 10, 60_000);

    vi.advanceTimersByTime(20_000);
    expect(checkRateLimit(key, 10, 60_000).resetInMs).toBe(40_000);

    vi.advanceTimersByTime(10_000);
    expect(checkRateLimit(key, 10, 60_000).resetInMs).toBe(30_000);
  });

  it('resetInMs es la ventana completa en el primer request', () => {
    expect(checkRateLimit(uniqueKey('t7'), 10, 45_000).resetInMs).toBe(45_000);
  });

  it('aisla buckets por key: uno saturado no afecta a otro', () => {
    const a = uniqueKey('t8a');
    const b = uniqueKey('t8b');
    for (let i = 0; i < 5; i++) checkRateLimit(a, 2, 60_000);
    expect(checkRateLimit(a, 2, 60_000).ok).toBe(false);
    expect(checkRateLimit(b, 2, 60_000).ok).toBe(true);
  });

  it('remaining nunca baja de 0 aunque se exceda', () => {
    const key = uniqueKey('t9');
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit(key, 3, 60_000).remaining).toBeGreaterThanOrEqual(0);
    }
  });

  it('con límite 0 no deja pasar nada', () => {
    const key = uniqueKey('t10');
    expect(checkRateLimit(key, 0, 60_000).ok).toBe(false);
  });
});

describe('getClientIp', () => {
  const req = (headers: Record<string, string>) =>
    new Request('http://localhost', { headers });

  it('toma la primera IP de x-forwarded-for', () => {
    expect(getClientIp(req({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe(
      '1.2.3.4'
    );
  });

  it('limpia los espacios de la IP', () => {
    expect(getClientIp(req({ 'x-forwarded-for': '  1.2.3.4  ' }))).toBe(
      '1.2.3.4'
    );
  });

  it('cae a x-real-ip si no hay x-forwarded-for', () => {
    expect(getClientIp(req({ 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9');
  });

  it('prefiere x-forwarded-for sobre x-real-ip', () => {
    const r = req({ 'x-forwarded-for': '1.1.1.1', 'x-real-ip': '2.2.2.2' });
    expect(getClientIp(r)).toBe('1.1.1.1');
  });

  it('devuelve "unknown" si no hay ninguno', () => {
    expect(getClientIp(req({}))).toBe('unknown');
  });
});

describe('rateLimitResponse', () => {
  it('devuelve null cuando el request está permitido', () => {
    expect(rateLimitResponse({ ok: true, remaining: 5, resetInMs: 1000 })).toBe(
      null
    );
  });

  it('devuelve 429 con mensaje traducido cuando está bloqueado', async () => {
    const res = rateLimitResponse({ ok: false, remaining: 0, resetInMs: 30_000 });
    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);

    const body = await res!.json();
    expect(body.errorType).toBe('RATE_LIMITED');
    expect(body.error).toMatch(/Demasiadas consultas/i);
  });

  it('envía Retry-After en segundos, redondeado hacia arriba', () => {
    const res = rateLimitResponse({ ok: false, remaining: 0, resetInMs: 30_001 });
    expect(res!.headers.get('Retry-After')).toBe('31');
  });

  it('Retry-After nunca es 0 (si no, el cliente reintenta en loop)', () => {
    const res = rateLimitResponse({ ok: false, remaining: 0, resetInMs: 1 });
    expect(Number(res!.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
  });

  it('declara Content-Type JSON y remaining 0', () => {
    const res = rateLimitResponse({ ok: false, remaining: 0, resetInMs: 5000 });
    expect(res!.headers.get('Content-Type')).toBe('application/json');
    expect(res!.headers.get('X-RateLimit-Remaining')).toBe('0');
  });
});

describe('LIMITS', () => {
  it('cada endpoint tiene límite y ventana válidos', () => {
    for (const [name, cfg] of Object.entries(LIMITS)) {
      expect(cfg.limit, name).toBeGreaterThan(0);
      expect(cfg.windowMs, name).toBeGreaterThan(0);
    }
  });

  it('el chat con IA está más limitado que el balanceo', () => {
    // La IA cuesta plata (Gemini) y cuota de Riot: es la más cara.
    expect(LIMITS.aiChat.limit).toBeLessThan(LIMITS.balance.limit);
  });

  it('cambiar la API key usa la ventana más larga', () => {
    // Cambiar la key es raro y sensible: 5 por 5 min, no 5 por 1 min.
    expect(LIMITS.riotKey.windowMs).toBeGreaterThan(LIMITS.aiChat.windowMs);
  });
});
