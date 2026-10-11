import { describe, it, expect, vi } from 'vitest';
import type { RiotRegion } from '@/lib/types';

// riot.ts importa getRiotKey, que a su vez toca fs y Supabase. No nos interesa
// ninguno de los dos para testear el mapeo de regiones, así que lo aplanamos.
vi.mock('@/lib/riotKey', () => ({ getRiotKey: () => 'RGAPI-test' }));

const { getRegionalRouting } = await import('@/lib/riot');

/**
 * Una región mal mapeada manda las requests al shard equivocado de Riot:
 * la API responde 404 y la app dice "no se encontró al invocador" cuando en
 * realidad el invocador existe. Es la clase de bug más difícil de debuggear
 * de toda la capa de Riot.
 */
describe('getRegionalRouting', () => {
  it('todas las regiones de americas van a americas', () => {
    const americas: RiotRegion[] = ['la1', 'la2', 'na1', 'br1'];
    for (const r of americas) {
      expect(getRegionalRouting(r), r).toBe('americas');
    }
  });

  it('euw1 va a europe', () => {
    expect(getRegionalRouting('euw1')).toBe('europe');
  });

  it('la2 (Argentina/Latam) es americas, que es el caso real de la app', () => {
    expect(getRegionalRouting('la2')).toBe('americas');
  });

  it('no manda ninguna región a asia ni sea', () => {
    // El tipo RegionalRouting permite 'asia' y 'sea', pero hoy ninguna región
    // soportada mapea ahí. Si algún día se agrega una región asiática hay que
    // revisar esta tabla: el default cae en 'americas', que sería incorrecto.
    const supported: RiotRegion[] = ['la1', 'la2', 'na1', 'br1', 'euw1'];
    for (const r of supported) {
      expect(getRegionalRouting(r)).not.toBe('asia');
      expect(getRegionalRouting(r)).not.toBe('sea');
    }
  });

  it('cae en americas ante una región desconocida (no explota)', () => {
    // Documenta el comportamiento: es un default silencioso. Si se agrega una
    // región nueva sin tocar el switch, esto falla en producción con 404.
    expect(getRegionalRouting('kr' as RiotRegion)).toBe('americas');
    expect(getRegionalRouting('' as RiotRegion)).toBe('americas');
  });

  it('es una función pura: llamarla dos veces da lo mismo', () => {
    expect(getRegionalRouting('br1')).toBe(getRegionalRouting('br1'));
  });
});
