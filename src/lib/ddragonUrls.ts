/**
 * URLs de DDragon en un solo lugar.
 *
 * Antes cada componente hardcodeaba `.../cdn/14.20.1/img/...` (13 copias). Cuando
 * Riot saca un patch esas URLs devuelven 404 y los avatares de la squad aparecen
 * rotos en toda la app. Acá vive una sola constante y todas las URLs salen de acá.
 *
 * La versión se puede fijar con NEXT_PUBLIC_DDRAGON_VERSION. El server además
 * puede adoptarla en caliente con `setDdragonVersion()`, que usa la versión real
 * que reporta la API de Riot (ver `lib/ddragon.ts`). En el cliente no podemos
 * hacer esa llamada: el valor se resuelve en build, así que sin la variable de
 * entorno queda el default.
 */

const DDRAGON_CDN = 'https://ddragon.leagueoflegends.com/cdn';

const DEFAULT_VERSION = '14.20.1';

let currentVersion = process.env.NEXT_PUBLIC_DDRAGON_VERSION || DEFAULT_VERSION;

/** Versión de patch con la que se arman las URLs. */
export function getDdragonVersion(): string {
  return currentVersion;
}

/** Adopta la versión real que reporta la API de Riot. Solo aplica en el server. */
export function setDdragonVersion(version: string | undefined): void {
  if (version) currentVersion = version;
}

export function profileIconUrl(profileIconId?: number | null): string {
  const id = profileIconId || 29;
  return `${DDRAGON_CDN}/${currentVersion}/img/profileicon/${id}.png`;
}

export function championSquareUrl(championName?: string | null): string {
  return `${DDRAGON_CDN}/${currentVersion}/img/champion/${championName}.png`;
}
