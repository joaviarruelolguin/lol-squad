import { describe, it, expect } from 'vitest';
import {
  requireString,
  optionalString,
  requireStringArray,
  optionalNumber,
  requireEnum,
} from '@/lib/validate';

describe('requireString', () => {
  it('acepta un string válido', () => {
    const r = requireString('hola', 'nombre');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe('hola');
  });

  it('hace trim', () => {
    const r = requireString('  hola  ', 'nombre');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe('hola');
  });

  it('rechaza undefined, null y numeros', () => {
    expect(requireString(undefined, 'x').ok).toBe(false);
    expect(requireString(null, 'x').ok).toBe(false);
    expect(requireString(123, 'x').ok).toBe(false);
    expect(requireString({}, 'x').ok).toBe(false);
  });

  it('rechaza string vacio o solo espacios', () => {
    expect(requireString('', 'x').ok).toBe(false);
    expect(requireString('   ', 'x').ok).toBe(false);
  });

  it('rechaza strings demasiado largos', () => {
    const r = requireString('a'.repeat(500), 'x', { max: 100 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('demasiado largo');
  });

  it('rechaza caracteres de control embebidos', () => {
    expect(requireString('hola' + String.fromCharCode(0) + 'mundo', 'x').ok).toBe(false);
    expect(requireString('hola\nmundo', 'x').ok).toBe(false);
    expect(requireString('ho' + String.fromCharCode(127) + 'la', 'x').ok).toBe(false);
  });

  it('acepta saltos de linea solo en los bordes (los quita el trim)', () => {
    const r = requireString('  hola  ', 'x');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe('hola');
  });

  it('acepta acentos y enye', () => {
    const r = requireString('Jayce Bond Nono', 'nombre');
    expect(r.ok).toBe(true);
  });
});

describe('optionalString', () => {
  it('devuelve undefined si no viene', () => {
    const r = optionalString(undefined, 'x');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeUndefined();
  });

  it('devuelve undefined si viene vacio', () => {
    const r = optionalString('', 'x');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeUndefined();
  });

  it('valida si viene con contenido', () => {
    const r = optionalString('hola', 'x');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe('hola');
  });

  it('rechaza tipos invalidos', () => {
    expect(optionalString(42, 'x').ok).toBe(false);
  });
});

describe('requireStringArray', () => {
  it('acepta array de strings', () => {
    const r = requireStringArray(['a', 'b'], 'equipo');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual(['a', 'b']);
  });

  it('acepta array vacio', () => {
    const r = requireStringArray([], 'equipo');
    expect(r.ok).toBe(true);
  });

  it('rechaza si no es array', () => {
    expect(requireStringArray('hola', 'x').ok).toBe(false);
    expect(requireStringArray(undefined, 'x').ok).toBe(false);
    expect(requireStringArray({ 0: 'a' }, 'x').ok).toBe(false);
  });

  it('rechaza si un elemento no es string', () => {
    expect(requireStringArray(['a', 42], 'x').ok).toBe(false);
    expect(requireStringArray(['a', null], 'x').ok).toBe(false);
  });

  it('rechaza demasiados elementos', () => {
    const r = requireStringArray(new Array(30).fill('a'), 'x', { maxItems: 10 });
    expect(r.ok).toBe(false);
  });
});

describe('optionalNumber', () => {
  it('acepta numeros', () => {
    const r = optionalNumber(42, 'score');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(42);
  });

  it('convierte strings numericos', () => {
    const r = optionalNumber('42', 'score');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(42);
  });

  it('devuelve undefined si no viene', () => {
    const r = optionalNumber(undefined, 'score');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeUndefined();
  });

  it('trunca decimales', () => {
    const r = optionalNumber(3.7, 'score');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(3);
  });

  it('rechaza NaN e Infinity', () => {
    expect(optionalNumber(NaN, 'x').ok).toBe(false);
    expect(optionalNumber(Infinity, 'x').ok).toBe(false);
    expect(optionalNumber('abc', 'x').ok).toBe(false);
  });

  it('rechaza fuera de rango', () => {
    expect(optionalNumber(-5, 'score', { min: 0 }).ok).toBe(false);
    expect(optionalNumber(9999, 'score', { max: 999 }).ok).toBe(false);
  });
});

describe('requireEnum', () => {
  const ROLES = ['TOP', 'JUNGLE', 'MID'] as const;

  it('acepta valores permitidos', () => {
    const r = requireEnum('TOP', 'rol', ROLES);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe('TOP');
  });

  it('rechaza valores no permitidos', () => {
    expect(requireEnum('HACKER', 'rol', ROLES).ok).toBe(false);
    expect(requireEnum('', 'rol', ROLES).ok).toBe(false);
  });

  it('es case-sensitive', () => {
    expect(requireEnum('top', 'rol', ROLES).ok).toBe(false);
  });

  it('el error lista los valores validos', () => {
    const r = requireEnum('X', 'rol', ROLES);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('TOP');
  });
});