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
});
