import { setDdragonVersion } from './ddragonUrls';

let championCache: Record<number, { name: string; key: string; id: string }> | null = null;

/**
 * Datos de campeones de DDragon (nombre legible + key), cacheados en memoria.
 *
 * Vive en el server: es el catálogo completo de campeones y ningún componente lo
 * necesita en el browser. Bajarlo una vez por sesión de lambda es gratis.
 */export async function getChampionInfo(championId: number): Promise<{ name: string; id: string }> {
  if (!championCache) {
    try {
      // Obtenemos la última versión de DDragon
      const versionsRes = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
      const versions: string[] = await versionsRes.json();
      const latest = versions[0] || '14.20.1';

      // Adoptamos la versión real para que las URLs de imágenes no queden
      // apuntando a un patch que Riot ya retirement.
      setDdragonVersion(latest);

      const champsRes = await fetch(`https://ddragon.leagueoflegends.com/cdn/${latest}/data/es_AR/champion.json`);
      const data = await champsRes.json();
      championCache = {};

      for (const champKey in data.data) {
        const champ = data.data[champKey];
        championCache[Number(champ.key)] = {
          name: champ.name,
          key: champ.key,
          id: champ.id,
        };
      }
    } catch {
      return { name: `Champ #${championId}`, id: 'Unknown' };
    }
  }

  return championCache?.[championId] || { name: `Champ #${championId}`, id: 'Unknown' };
}
