import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SimpleCache } from '@/lib/cache';

describe('SimpleCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('devuelve undefined para una key que nunca se guardó', () => {
    expect(new SimpleCache().get('nope')).toBeUndefined();
  });

  it('guarda y recupera un valor', () => {
    const c = new SimpleCache();
    c.set('k', { a: 1 });
    expect(c.get('k')).toEqual({ a: 1 });
  });

  it('no muta el objeto guardado (devuelve la referencia, no una copia)', () => {
    const c = new SimpleCache();
    const data = { a: 1 };
    c.set('k', data);
    expect(c.get('k')).toBe(data);
  });

  it('sirve valores falsos sin confundir con "no existe"', () => {
    const c = new SimpleCache();
    c.set('falsy', 0);
    c.set('null', null);
    c.set('false', false);
    c.set('empty', '');

    expect(c.get('falsy')).toBe(0);
    expect(c.get('null')).toBeNull();
    expect(c.get('false')).toBe(false);
    expect(c.get('empty')).toBe('');
  });

  it('sirve el valor mientras el TTL no venció', () => {
    const c = new SimpleCache(60_000);
    c.set('k', 'v');
    vi.advanceTimersByTime(59_999);
    expect(c.get('k')).toBe('v');
  });

  it('expira el valor pasado el TTL', () => {
    const c = new SimpleCache(60_000);
    c.set('k', 'v');
    vi.advanceTimersByTime(60_001);
    expect(c.get('k')).toBeUndefined();
  });

  it('acepta un TTL por entrada que pisa el default', () => {
    const c = new SimpleCache(60_000);
    c.set('corto', 'v', 1_000);
    c.set('largo', 'v');

    vi.advanceTimersByTime(1_500);
    expect(c.get('corto')).toBeUndefined();
    expect(c.get('largo')).toBe('v');
  });

  it('invalidate borra solo la key indicada', () => {
    const c = new SimpleCache();
    c.set('a', 1);
    c.set('b', 2);
    c.invalidate('a');
    expect(c.get('a')).toBeUndefined();
    expect(c.get('b')).toBe(2);
  });

  it('invalidate sobre una key inexistente no explota', () => {
    const c = new SimpleCache();
    expect(() => c.invalidate('nope')).not.toThrow();
  });

  it('clear borra todo', () => {
    const c = new SimpleCache();
    c.set('a', 1);
    c.set('b', 2);
    c.clear();
    expect(c.size).toBe(0);
    expect(c.get('a')).toBeUndefined();
  });

  it('set sobreescribe el valor anterior', () => {
    const c = new SimpleCache();
    c.set('k', 'viejo');
    c.set('k', 'nuevo');
    expect(c.get('k')).toBe('nuevo');
  });

  it('set sobreescribe y renueva el TTL', () => {
    const c = new SimpleCache(10_000);
    c.set('k', 'v');
    vi.advanceTimersByTime(9_000);
    c.set('k', 'v2');
    vi.advanceTimersByTime(9_000);
    // Si el TTL no se hubiera renovado, hace 18s que pasó > 10s.
    expect(c.get('k')).toBe('v2');
  });

  it('size cuenta las entradas guardadas', () => {
    const c = new SimpleCache();
    expect(c.size).toBe(0);
    c.set('a', 1);
    c.set('b', 2);
    expect(c.size).toBe(2);
    c.set('a', 3);
    expect(c.size).toBe(2);
  });

  it('una entrada expirada se purga al leerla (no queda para siempre)', () => {
    const c = new SimpleCache(1_000);
    c.set('k', 'v');
    expect(c.size).toBe(1);
    vi.advanceTimersByTime(1_001);
    expect(c.get('k')).toBeUndefined();
    expect(c.size).toBe(0);
  });

  it('dos instancias no comparten estado', () => {
    const a = new SimpleCache();
    const b = new SimpleCache();
    a.set('k', 'de-a');
    expect(b.get('k')).toBeUndefined();
  });

  describe('tope de tamaño', () => {
    it('no crece indefinidamente: expulsa cuando llega al tope', () => {
      const c = new SimpleCache(60_000, 10);
      for (let i = 0; i < 100; i++) c.set(`k${i}`, i);
      expect(c.size).toBeLessThanOrEqual(10);
    });

    it('expulsa primero lo que ya venció', () => {
      const c = new SimpleCache(60_000, 3);
      c.set('viejo', 1, 1_000);
      c.set('medio', 2, 30_000);
      c.set('nuevo', 3, 60_000);

      vi.advanceTimersByTime(1_001);
      // Insertar una cuarta entrada dispara el barrido: 'viejo' ya venció.
      c.set('cuarto', 4, 60_000);

      expect(c.get('viejo')).toBeUndefined();
      expect(c.get('medio')).toBe(2);
      expect(c.get('nuevo')).toBe(3);
      expect(c.get('cuarto')).toBe(4);
    });

    it('cuando nada venció, expulsa la entry que vence antes', () => {
      const c = new SimpleCache(60_000, 2);
      c.set('corta', 1, 5_000);
      c.set('larga', 2, 60_000);

      c.set('nueva', 3, 60_000);

      expect(c.get('corta')).toBeUndefined();
      expect(c.get('larga')).toBe(2);
      expect(c.get('nueva')).toBe(3);
      expect(c.size).toBe(2);
    });

    it('no expulsa entradas sanas si el tope es alto', () => {
      const c = new SimpleCache(60_000, 1000);
      for (let i = 0; i < 500; i++) c.set(`k${i}`, i);
      expect(c.size).toBe(500);
      expect(c.get('k0')).toBe(0);
    });
  });

  it('es genérico: declara el tipo de lo que guarda', () => {
    interface DTO {
      n: number;
    }
    const c = new SimpleCache<DTO>();
    c.set('k', { n: 7 });
    // Sin cast: si el tipo estuviera mal, esto no compilaría.
    const value: DTO | undefined = c.get('k');
    expect(value?.n).toBe(7);
  });
});
