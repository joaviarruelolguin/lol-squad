import { describe, it, expect } from 'vitest';
import {
  matchIdSequence,
  sortByRecency,
  isValidMatchId,
  routingFromMatchId,
  groupByRouting,
} from '@/lib/matchId';

describe('matchIdSequence', () => {
  it('extrae el número del sufijo', () => {
    expect(matchIdSequence('LA2_1630050965')).toBe(1630050965);
  });

  it('funciona con cualquier prefijo', () => {
    expect(matchIdSequence('EUW1_1629996834')).toBe(1629996834);
    expect(matchIdSequence('KR_1630000000')).toBe(1630000000);
  });

  it('NO es un timestamp unix (por eso no sirve para sacar la fecha)', () => {
    // Este ID es de octubre de 2026, pero interpretarlo como epoch en segundos
    // da agosto de 2021. De ahi que el módulo NO exponga nada de fechas.
    expect(matchIdSequence('LA2_1630050965')).not.toBe(
      Math.floor(new Date('2026-10-12T05:12:00Z').getTime() / 1000)
    );
  });

  it('usa el último separador, por si el prefijo trae underscore', () => {
    expect(matchIdSequence('ALGO_LA2_1630050965')).toBe(1630050965);
  });

  it('devuelve 0 con formatos que no puede interpretar', () => {
    expect(matchIdSequence('nada')).toBe(0);
    expect(matchIdSequence('')).toBe(0);
    expect(matchIdSequence('LA2_')).toBe(0);
    expect(matchIdSequence('LA2_abc')).toBe(0);
    expect(matchIdSequence('LA2_1.7e12')).toBe(0);
    expect(matchIdSequence('LA2_0')).toBe(0);
  });

  it('es monótona: un sufijo mayor es una partida más reciente', () => {
    // Datos reales de la squad, con su fecha real al lado.
    const real = [
      { id: 'LA2_1628216800', fecha: '2026-10-03 22:17' },
      { id: 'LA2_1628843079', fecha: '2026-10-06 22:04' },
      { id: 'LA2_1629198726', fecha: '2026-10-08 18:25' },
      { id: 'LA2_1630050965', fecha: '2026-10-12 05:12' },
    ];

    const sorted = [...real].sort((a, b) =>
      matchIdSequence(b.id) - matchIdSequence(a.id)
    );
    expect(sorted.map((r) => r.fecha)).toEqual([
      '2026-10-12 05:12',
      '2026-10-08 18:25',
      '2026-10-06 22:04',
      '2026-10-03 22:17',
    ]);
  });
});

describe('sortByRecency', () => {
  it('ordena de más reciente a más antigua', () => {
    const ids = ['LA2_1628216800', 'LA2_1630050965', 'LA2_1628843079'];
    expect(sortByRecency(ids)).toEqual([
      'LA2_1630050965',
      'LA2_1628843079',
      'LA2_1628216800',
    ]);
  });

  it('no muta el array original', () => {
    const ids = ['LA2_1628216800', 'LA2_1630050965'];
    const copia = [...ids];
    sortByRecency(ids);
    expect(ids).toEqual(copia);
  });

  it('manda al final lo que no se puede parsear', () => {
    const ids = ['basura', 'LA2_1628216800', 'LA2_1630050965'];
    expect(sortByRecency(ids)).toEqual([
      'LA2_1630050965',
      'LA2_1628216800',
      'basura',
    ]);
  });

  it('ordena mezclando regiones', () => {
    const ids = ['LA2_1629025724', 'EUW1_1630050965', 'BR1_1628216800'];
    expect(sortByRecency(ids)).toEqual([
      'EUW1_1630050965',
      'LA2_1629025724',
      'BR1_1628216800',
    ]);
  });
});

describe('isValidMatchId', () => {
  it('acepta los formatos reales', () => {
    expect(isValidMatchId('LA2_1630050965')).toBe(true);
    expect(isValidMatchId('EUW1_1629996834')).toBe(true);
  });

  it('rechaza basura', () => {
    expect(isValidMatchId('')).toBe(false);
    expect(isValidMatchId('../../etc/passwd')).toBe(false);
    expect(isValidMatchId('LA2_abc')).toBe(false);
    expect(isValidMatchId("'; DROP TABLE match_cache; --")).toBe(false);
  });
});

describe('routingFromMatchId', () => {
  it('mapea América', () => {
    for (const p of ['LA1', 'LA2', 'BR1', 'NA1']) {
      expect(routingFromMatchId(`${p}_6801234567`)).toBe('americas');
    }
  });

  it('mapea Europa', () => {
    for (const p of ['EUW1', 'EUNE', 'RU', 'TR']) {
      expect(routingFromMatchId(`${p}_6801234567`)).toBe('europe');
    }
  });

  it('mapea Asia y SEA', () => {
    for (const p of ['JP', 'KR']) {
      expect(routingFromMatchId(`${p}_6801234567`)).toBe('asia');
    }
    for (const p of ['SG', 'ID', 'PH', 'TH', 'VN']) {
      expect(routingFromMatchId(`${p}_6801234567`)).toBe('sea');
    }
  });

  it('es case-insensitive', () => {
    expect(routingFromMatchId('euw1_6801234567')).toBe('europe');
  });

  it('cae a americas si el prefijo no se reconoce', () => {
    expect(routingFromMatchId('XX9_6801234567')).toBe('americas');
    expect(routingFromMatchId('basura')).toBe('americas');
  });

  it('distingue un shard europeo de uno americano', () => {
    // El bug que arregla: pedir un EUW1_ a americas.api da 404.
    expect(routingFromMatchId('EUW1_6801234567')).not.toBe(
      routingFromMatchId('LA2_6801234567')
    );
  });
});

describe('groupByRouting', () => {
  it('agrupa por routing', () => {
    const groups = groupByRouting([
      'LA2_1629025724',
      'BR1_1629025725',
      'EUW1_1629025726',
      'LA2_1629025727',
    ]);

    expect(groups.get('americas')).toEqual([
      'LA2_1629025724',
      'BR1_1629025725',
      'LA2_1629025727',
    ]);
    expect(groups.get('europe')).toEqual(['EUW1_1629025726']);
    expect(groups.size).toBe(2);
  });

  it('devuelve un Map vacío sin entradas', () => {
    expect(groupByRouting([]).size).toBe(0);
  });

  it('no pierde ninguna partida', () => {
    const ids = [
      'LA2_1629025724',
      'EUW1_1629025725',
      'KR_1629025726',
      'SG_1629025727',
      'basura',
    ];
    const total = [...groupByRouting(ids).values()].reduce((s, g) => s + g.length, 0);
    expect(total).toBe(ids.length);
  });
});
