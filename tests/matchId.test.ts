import { describe, it, expect } from 'vitest';
import {
  matchIdTimestamp,
  matchIdEpoch,
  sortByRecency,
  isValidMatchId,
  routingFromMatchId,
  groupByRouting,
} from '@/lib/matchId';

describe('matchIdTimestamp', () => {
  it('extrae el epoch en milisegundos', () => {
    expect(matchIdTimestamp('LA2_6801234567')).toBe(6801234567000);
  });

  it('funciona con cualquier prefijo', () => {
    expect(matchIdTimestamp('EUW1_6700000000')).toBe(6700000000000);
    expect(matchIdTimestamp('KR_6800000000')).toBe(6800000000000);
  });

  it('rechaza un epoch en milisegundos', () => {
    // 1770000000000 son ms, no segundos: Riot nunca los usa.
    expect(matchIdTimestamp('LA2_1770000000000')).toBeNull();
  });

  it('rechaza notación exponencial', () => {
    // Number('1.7e12') = 1700000000000, pero no es un match ID.
    expect(matchIdTimestamp('LA2_1.7e12')).toBeNull();
  });

  it('rechaza formatos sin separador o sin número', () => {
    expect(matchIdTimestamp('nada')).toBeNull();
    expect(matchIdTimestamp('')).toBeNull();
    expect(matchIdTimestamp('LA2_')).toBeNull();
    expect(matchIdTimestamp('LA2_abc')).toBeNull();
  });

  it('rechaza números fuera de rango razonable', () => {
    expect(matchIdTimestamp('LA2_0')).toBeNull();
    expect(matchIdTimestamp('LA2_123')).toBeNull();
  });

  it('devuelve null (y no 0) para que "no sé" no parezca "año 1970"', () => {
    expect(matchIdTimestamp('basura')).toBeNull();
    expect(matchIdTimestamp('basura')).not.toBe(0);
  });

  it('usa el último separador, por si el prefijo trae underscore', () => {
    expect(matchIdTimestamp('ALGO_LA2_6801234567')).toBe(6801234567000);
  });
});

describe('matchIdEpoch', () => {
  it('devuelve segundos', () => {
    expect(matchIdEpoch('LA2_6801234567')).toBe(6801234567);
  });

  it('devuelve 0 si no se puede parsear, para que sort no rompa', () => {
    expect(matchIdEpoch('basura')).toBe(0);
  });
});

describe('sortByRecency', () => {
  it('ordena de más reciente a más antigua', () => {
    const ids = ['LA2_1000000000', 'LA2_1800000000', 'LA2_1500000000'];
    expect(sortByRecency(ids)).toEqual([
      'LA2_1800000000',
      'LA2_1500000000',
      'LA2_1000000000',
    ]);
  });

  it('no muta el array original', () => {
    const ids = ['LA2_1000000000', 'LA2_1800000000'];
    const copia = [...ids];
    sortByRecency(ids);
    expect(ids).toEqual(copia);
  });

  it('manda al final lo que no se puede parsear', () => {
    const ids = ['basura', 'LA2_1000000000', 'LA2_1800000000'];
    expect(sortByRecency(ids)).toEqual([
      'LA2_1800000000',
      'LA2_1000000000',
      'basura',
    ]);
  });

  it('ordena mezclando regiones', () => {
    const ids = ['LA2_1700000000', 'EUW1_1800000000', 'BR1_1600000000'];
    expect(sortByRecency(ids)).toEqual([
      'EUW1_1800000000',
      'LA2_1700000000',
      'BR1_1600000000',
    ]);
  });
});

describe('isValidMatchId', () => {
  it('acepta los formatos reales', () => {
    expect(isValidMatchId('LA2_6801234567')).toBe(true);
    expect(isValidMatchId('EUW1_6700000000')).toBe(true);
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
      'LA2_1000000000',
      'BR1_1000000001',
      'EUW1_1000000002',
      'LA2_1000000003',
    ]);

    expect(groups.get('americas')).toEqual([
      'LA2_1000000000',
      'BR1_1000000001',
      'LA2_1000000003',
    ]);
    expect(groups.get('europe')).toEqual(['EUW1_1000000002']);
    expect(groups.size).toBe(2);
  });

  it('devuelve un Map vacío sin entradas', () => {
    expect(groupByRouting([]).size).toBe(0);
  });

  it('no pierde ninguna partida', () => {
    const ids = [
      'LA2_1000000000',
      'EUW1_1000000001',
      'KR_1000000002',
      'SG_1000000003',
      'basura',
    ];
    const total = [...groupByRouting(ids).values()].reduce((s, g) => s + g.length, 0);
    expect(total).toBe(ids.length);
  });
});
