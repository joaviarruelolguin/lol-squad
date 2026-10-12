import { setDdragonVersion } from './ddragonUrls';

interface ChampionEntry {
  name: string;
  key: string;
  id: string;
}

/**
 * Cacheamos la PROMESA, no el resultado.
 *
 * `/api/stats` llama a `getChampionInfo` con `Promise.all` sobre las 3 maestrías
 * de cada uno de los 6 miembros: 18 llamadas concurrentes. Cacheando el
 * resultado, las 18 veían `championCache === null` y disparaban 18 descargas de
 * `versions.json` + `champion.json`. Cacheando la promesa, la primera arranca la
 * carga y las otras 17 esperan esa misma.
 */
let championCache: Promise<Record<number, ChampionEntry>> | null = null;

async function loadChampions(): Promise<Record<number, ChampionEntry>> {
  try {
    // Obtenemos la última versión de DDragon
    const versionsRes = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
    const versions: string[] = await versionsRes.json();
    const latest = versions[0] || '14.20.1';

    // Adoptamos la versión real para que las URLs de imágenes no queden
    // apuntando a un patch que Riot ya retiró.
    setDdragonVersion(latest);

    const champsRes = await fetch(
      `https://ddragon.leagueoflegends.com/cdn/${latest}/data/es_AR/champion.json`
    );
    const data = await champsRes.json();
    const cache: Record<number, ChampionEntry> = {};

    for (const champKey in data.data) {
      const champ = data.data[champKey];
      cache[Number(champ.key)] = {
        name: champ.name,
        key: champ.key,
        id: champ.id,
      };
    }
    return cache;
  } catch {
    // Catálogo vacío: cada llamador cae en su nombre de reserva.
    return {};
  }
}

/**
 * Datos de campeones de DDragon (nombre legible + key), cacheados en memoria.
 *
 * Vive en el server: es el catálogo completo de campeones y ningún componente lo
 * necesita en el browser.
 */
export async function getChampionInfo(
  championId: number
): Promise<{ name: string; id: string }> {
  if (!championCache) championCache = loadChampions();

  const entry = (await championCache)[championId];
  return entry ?? { name: `Champ #${championId}`, id: 'Unknown' };
}

/** Descarta el catálogo. Para cuando cambia la API key y queremos datos frescos. */
export function clearChampionCache(): void {
  championCache = null;
}
