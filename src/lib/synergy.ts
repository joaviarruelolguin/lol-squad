import type { DuoStat, TrioStat } from './types';

export type SynergyRating = DuoStat['synergyRating'];

/**
 * Clasifica un winrate como rating de sinergia.
 *
 * - GOD_TIER: 60% o más
 * - REGULAR:  45-59%
 * - FRIA:     30-44%
 * - A_PULIR:  menos de 30%
 */
export function duoSynergyRating(winrate: number): SynergyRating {
  if (winrate >= 60) return 'GOD_TIER';
  if (winrate >= 45) return 'REGULAR';
  if (winrate >= 30) return 'FRIA';
  return 'A_PULIR';
}

/**
 * Igual que duoSynergyRating pero más exigente con muestras chicas.
 * Con menos de 3 partidas exigimos más winrate para considerar God Tier,
 * porque 2/2 al 100% no es evidencia de nada.
 */
export function trioSynergyRating(winrate: number, games: number): SynergyRating {
  if (games >= 3) {
    if (winrate >= 65) return 'GOD_TIER';
    if (winrate >= 50) return 'REGULAR';
    if (winrate >= 33) return 'FRIA';
    return 'A_PULIR';
  }
  if (winrate >= 75) return 'GOD_TIER';
  if (winrate >= 55) return 'REGULAR';
  if (winrate >= 35) return 'FRIA';
  return 'A_PULIR';
}

/** Etiqueta legible en español para cada rating */
export const SYNERGY_LABELS: Record<SynergyRating, string> = {
  GOD_TIER: 'God Tier',
  REGULAR: 'Regular',
  FRIA: 'Fría',
  A_PULIR: 'A pulir',
};

/**
 * Ordena combos por confianza: primero los que tienen más partidas,
 * después por winrate. Un 100% en 2 partidas no es confiable.
 */
export function sortByConfidence<
  T extends { games: number; winrate: number },
>(combos: T[]): T[] {
  return [...combos].sort((a, b) => {
    if (b.games !== a.games) return b.games - a.games;
    return b.winrate - a.winrate;
  });
}