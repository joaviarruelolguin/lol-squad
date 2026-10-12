import type { RegionalRouting } from './types';

/**
 * Utilidades sobre match IDs de Riot.
 *
 * Riot codifica el ID como `PREFIX_<secuencia>` (ej: `LA2_1630050965`).
 *
 * Dos cosas que sí podemos sacar del ID:
 *
 * 1. El shard. `americas.api.riotgames.com` sirve match-v5 de cualquier shard de
 *    América, pero pedir un `EUW1_...` ahí da 404. Si en la squad hay alguien de
 *    Europa, usar el routing del primer miembro rompe.
 * 2. La recencia RELATIVA. El sufijo numérico es un contador monotónico: una
 *    partida con sufijo mayor es más reciente. Ordenar por ahí es correcto.
 *
 * OJO con lo que el ID NO es: no es un timestamp unix. El 1630050965 de
 * `LA2_1630050965` es una partida de octubre de 2026, pero interpretarlo como
 * epoch en segundos da agosto de 2021. Así que del ID no sale ninguna fecha, solo
 * el orden. Para filtrar por ventana temporal hay que traer el detalle y usar el
 * `gameCreation` de verdad (ver `getRecentMatchesWithCache` en matchCache.ts).
 */

/**
 * Secuencia monotónica del match ID, o 0 si el formato no es el esperado.
 *
 * Sirve solo para ORDENAR. Devolver 0 para lo no parseable deja esas partidas al
 * final de un sort, que es lo que queremos: no las descarta, las pone donde no
 * molestan.
 */
export function matchIdSequence(matchId: string): number {
  const sep = matchId.lastIndexOf('_');
  if (sep < 0) return 0;

  const raw = matchId.slice(sep + 1);
  // Parseo estricto: Number('1.7e12') = 1700000000000, que no es un match ID.
  if (!/^\d{1,15}$/.test(raw)) return 0;

  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Ordena por recencia, de más reciente a más antigua. No muta el original. */
export function sortByRecency(matchIds: string[]): string[] {
  return [...matchIds].sort((a, b) => matchIdSequence(b) - matchIdSequence(a));
}

/** Valida que el string tenga forma de match ID de Riot. */
export function isValidMatchId(matchId: string): boolean {
  return matchIdSequence(matchId) > 0;
}

/** Routing regional deducido del prefijo del match ID. */
export function routingFromMatchId(matchId: string): RegionalRouting {
  const prefix = matchId.split('_')[0]?.toUpperCase() ?? '';
  if (['LA1', 'LA2', 'BR1', 'NA1'].includes(prefix)) return 'americas';
  if (['EUW1', 'EUNE', 'RU', 'TR'].includes(prefix)) return 'europe';
  if (['JP', 'KR'].includes(prefix)) return 'asia';
  if (['SG', 'ID', 'PH', 'TH', 'VN'].includes(prefix)) return 'sea';
  return 'americas';
}

/**
 * Agrupa match IDs por routing.
 *
 * Es lo que permite traer un lote mezclando regiones: `getMatchesWithCache`
 * llama a Riot con cada grupo usando su routing, en vez de asumir que toda la
 * squad está en América.
 */
export function groupByRouting(
  matchIds: string[]
): Map<RegionalRouting, string[]> {
  const groups = new Map<RegionalRouting, string[]>();
  for (const id of matchIds) {
    const routing = routingFromMatchId(id);
    const bucket = groups.get(routing);
    if (bucket) bucket.push(id);
    else groups.set(routing, [id]);
  }
  return groups;
}
