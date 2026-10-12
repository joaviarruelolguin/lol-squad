import type { RegionalRouting } from './types';

/**
 * Utilidades sobre match IDs de Riot.
 *
 * Riot codifica el ID como `PREFIX_<epoch en segundos>` (ej: `LA2_6801234567`).
 * Del propio ID salen dos cosas que nos ahorran requests:
 *
 * 1. La fecha. El epoch es monótono, así que comparar sufijos equivale a
 *    comparar fechas. Permite filtrar y ordenar partidas por antigüedad SIN
 *    traer el detalle.
 * 2. El routing regional. `americas.api.riotgames.com` sirve match-v5 de
 *    cualquier shard de América, pero pedir un `EUW1_...` ahí da 404. Si en la
 *    squad hay alguien de Europa, usar el routing del primer miembro rompe.
 *
 * Antes estas tres cosas vivían duplicadas: `matchIdTime` en flex-matches,
 * `matchIdToTimestamp` en mvp y `routingFromMatchId` exportada desde el route.
 */

/**
 * Epoch en milisegundos de la partida, o `null` si el formato no es el esperado.
 *
 * Devolver `null` y no `0` a propósito: el 0 es un valor válido (1/1/1970) y
 * haría que "no lo sé" se confundiera con "es de 1970".
 */
export function matchIdTimestamp(matchId: string): number | null {
  const sep = matchId.lastIndexOf('_');
  if (sep < 0) return null;

  const raw = matchId.slice(sep + 1);
  // Parseo estricto: Number('1.7e12') = 1700000000000, que no es un match ID.
  if (!/^\d{1,15}$/.test(raw)) return null;

  const seconds = Number(raw);
  // Riot usa segundos. Los cortes descartan tanto un epoch en milisegundos
  // (13 dígitos) como basura numérica.
  if (!Number.isFinite(seconds) || seconds < 1e9 || seconds > 1e11) return null;

  return seconds * 1000;
}

/**
 * Epoch en segundos, para ordenar. 0 si no se puede parsear (así `sort` no
 * rompe y las partidas desconocidas quedan al final).
 */
export function matchIdEpoch(matchId: string): number {
  const ms = matchIdTimestamp(matchId);
  return ms === null ? 0 : ms / 1000;
}

/** Ordena por fecha, de más reciente a más antigua. No muta el original. */
export function sortByRecency(matchIds: string[]): string[] {
  return [...matchIds].sort((a, b) => matchIdEpoch(b) - matchIdEpoch(a));
}

/** Valida que el string tenga forma de match ID de Riot. */
export function isValidMatchId(matchId: string): boolean {
  return matchIdTimestamp(matchId) !== null;
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
