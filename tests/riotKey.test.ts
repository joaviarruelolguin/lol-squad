import { describe, it, expect } from 'vitest';
import { maskKey } from '@/lib/riotKey';

/**
 * La key de Riot es una credencial. Este módulo es lo único que la muestra al
 * usuario, así que un fallo acá significa key expuesta en pantalla.
 */
describe('maskKey', () => {
  const key = 'RGAPI-0123456789abcdef-0123-4567-89ab-cdef01234567';

  it('muestra el prefijo y los últimos 4 caracteres', () => {
    expect(maskKey(key)).toBe('RGAPI-...4567');
  });

  it('nunca devuelve la key completa', () => {
    expect(maskKey(key)).not.toBe(key);
    expect(maskKey(key)).not.toContain('0123456789abcdef');
  });

  it('no filtra la parte del medio (la larga)', () => {
    // Si el prefijo fuera más largo, el cuerpo se filtraría.
    const long = 'RGAPI-ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
    const masked = maskKey(long);
    expect(masked).not.toContain('MNOPQ');
  });

  it('devuelve vacío para una key vacía', () => {
    expect(maskKey('')).toBe('');
  });

  it('enmascara del todo una key demasiado corta', () => {
    // Con <= 12 caracteres no hay forma de mostrar prefijo y sufijo sin
    // exponer casi toda la key, así que se oculta entera.
    expect(maskKey('RGAPI-123')).toBe('••••••');
    expect(maskKey('012345678901')).toBe('••••••');
  });

  it('el límite de 12 caracteres decide entre mostrar u ocultar', () => {
    expect(maskKey('01234567890')).toBe('••••••'); // 11: oculta
    expect(maskKey('0123456789012')).not.toBe('••••••'); // 13: enmascara
  });

  it('nunca revela el cuerpo para una key corta', () => {
    // Todas de 11 caracteres o menos: la función las oculta enteras.
    for (const short of ['RGAPI-1', 'RGAPI-12345', '01234567890', 'RGAPI']) {
      expect(maskKey(short), short).toBe('••••••');
    }
  });

  it('la salida con puntos tiene siempre el mismo formato', () => {
    const masked = maskKey(key);
    expect(masked.split('...')).toHaveLength(2);
    expect(masked.split('...')[1]).toHaveLength(4);
  });
});
