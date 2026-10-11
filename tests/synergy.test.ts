import { describe, it, expect } from 'vitest';
import {
  duoSynergyRating,
  trioSynergyRating,
  SYNERGY_LABELS,
  sortByConfidence,
} from '@/lib/synergy';

describe('duoSynergyRating', () => {
  it('clasifica 100% como GOD_TIER', () => {
    expect(duoSynergyRating(100)).toBe('GOD_TIER');
  });

  it('usa 60% como umbral de GOD_TIER', () => {
    expect(duoSynergyRating(60)).toBe('GOD_TIER');
    expect(duoSynergyRating(59)).toBe('REGULAR');
  });

  it('usa 45% como umbral de REGULAR', () => {
    expect(duoSynergyRating(45)).toBe('REGULAR');
    expect(duoSynergyRating(44)).toBe('FRIA');
  });

  it('usa 30% como umbral de FRIA', () => {
    expect(duoSynergyRating(30)).toBe('FRIA');
    expect(duoSynergyRating(29)).toBe('A_PULIR');
  });

  it('devuelve A_PULIR para 0%', () => {
    expect(duoSynergyRating(0)).toBe('A_PULIR');
  });

  it('es monótona: más winrate nunca da peor rating', () => {
    const order = ['A_PULIR', 'FRIA', 'REGULAR', 'GOD_TIER'];
    let previous = -1;
    for (let wr = 0; wr <= 100; wr++) {
      const idx = order.indexOf(duoSynergyRating(wr));
      expect(idx).toBeGreaterThanOrEqual(previous);
      previous = idx;
    }
  });
});

describe('trioSynergyRating', () => {
  it('es más exigente con muestras de 3+ partidas', () => {
    // 60% con 5 partidas es REGULAR (no GOD_TIER)
    expect(trioSynergyRating(60, 5)).toBe('REGULAR');
    // 60% con 2 partidas tampoco llega a GOD_TIER (necesita 75%)
    expect(trioSynergyRating(60, 2)).toBe('REGULAR');
  });

  it('exige 65% para GOD_TIER con 3+ partidas', () => {
    expect(trioSynergyRating(65, 3)).toBe('GOD_TIER');
    expect(trioSynergyRating(64, 3)).toBe('REGULAR');
  });

  it('exige 75% para GOD_TIER con menos de 3 partidas', () => {
    expect(trioSynergyRating(75, 2)).toBe('GOD_TIER');
    expect(trioSynergyRating(74, 2)).toBe('REGULAR');
  });

  it('trata 2/2 al 100% como GOD_TIER pero con umbral alto', () => {
    // 2 partidas, 100% -> GOD_TIER (pasa el umbral de 75)
    expect(trioSynergyRating(100, 2)).toBe('GOD_TIER');
  });

  it('usa 50% como REGULAR con 3+ partidas', () => {
    expect(trioSynergyRating(50, 4)).toBe('REGULAR');
    expect(trioSynergyRating(49, 4)).toBe('FRIA');
  });

  it('usa 33% como FRIA con 3+ partidas', () => {
    expect(trioSynergyRating(33, 4)).toBe('FRIA');
    expect(trioSynergyRating(32, 4)).toBe('A_PULIR');
  });

  it('devuelve A_PULIR para 0%', () => {
    expect(trioSynergyRating(0, 10)).toBe('A_PULIR');
  });
});

describe('SYNERGY_LABELS', () => {
  it('tiene etiqueta para cada rating', () => {
    expect(SYNERGY_LABELS.GOD_TIER).toBe('God Tier');
    expect(SYNERGY_LABELS.REGULAR).toBe('Regular');
    expect(SYNERGY_LABELS.FRIA).toBe('Fría');
    expect(SYNERGY_LABELS.A_PULIR).toBe('A pulir');
  });
});

describe('sortByConfidence', () => {
  it('ordena por más partidas primero', () => {
    const combos = [
      { name: 'poco', games: 2, winrate: 100 },
      { name: 'mucho', games: 20, winrate: 50 },
      { name: 'medio', games: 8, winrate: 75 },
    ];
    const sorted = sortByConfidence(combos);
    expect(sorted.map((c) => c.name)).toEqual(['mucho', 'medio', 'poco']);
  });

  it('desempata por winrate cuando tienen las mismas partidas', () => {
    const combos = [
      { name: 'bajo', games: 5, winrate: 40 },
      { name: 'alto', games: 5, winrate: 80 },
    ];
    const sorted = sortByConfidence(combos);
    expect(sorted.map((c) => c.name)).toEqual(['alto', 'bajo']);
  });

  it('no muta el array original', () => {
    const combos = [
      { name: 'a', games: 2, winrate: 90 },
      { name: 'b', games: 10, winrate: 50 },
    ];
    const original = [...combos];
    sortByConfidence(combos);
    expect(combos).toEqual(original);
  });

  it('prioriza consistencia sobre porcentaje absurdo', () => {
    // El combo con 100% en 2 partidas va después del que tiene 60% en 20
    const combos = [
      { name: 'ruidoso', games: 2, winrate: 100 },
      { name: 'confiable', games: 20, winrate: 60 },
    ];
    const sorted = sortByConfidence(combos);
    expect(sorted[0].name).toBe('confiable');
  });
});