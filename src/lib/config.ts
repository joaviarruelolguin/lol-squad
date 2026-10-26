/**
 * Configuración de la app.
 *
 * Editá este objeto para personalizar la instancia sin tocar el código.
 * Si querés que sea configurable por entorno (útil para open source con
 * varios deployments), usá las variables de entorno con valor por defecto.
 */

/** Nombre de la app. Aparecerá en el header, el título del navegador y el README. */
export const APP_TITLE = process.env.NEXT_PUBLIC_APP_TITLE || 'LoL Squad Stats';

/** Subtítulo bajo el título en el header. */
export const APP_SUBTITLE =
  process.env.NEXT_PUBLIC_APP_SUBTITLE || 'Datos reales de Riot. Sin inventos.';

/** Descripción para metadatos SEO (aparece en Google y al compartir links). */
export const APP_DESCRIPTION =
  process.env.NEXT_PUBLIC_APP_DESCRIPTION ||
  'Dashboard de League of Legends para tu squad: ranks Flex, sinergias, análisis de partidas, premios y liga de customs.';

/** Link al código fuente. Aparece en el footer. Vaciarlo ('') lo oculta. */
export const APP_REPO_URL =
  process.env.NEXT_PUBLIC_APP_REPO_URL ||
  'https://github.com/joaviarruelolguin/lol-squad';

/**
 * Muestra la barra de estado y el modal para cargar la API key de Riot.
 *
 * Por defecto está oculta: si la key está puesta como variable de entorno en
 * Vercel, esa barra es ruido (y encima sondea /api/riot-key cada 60s). Para
 * volver a mostrarla en un deployment puntual, agregá
 * `NEXT_PUBLIC_SHOW_RIOT_KEY_UI=true` en Vercel y redeployá, o ponela en
 * .env.local para desarrollo local.
 *
 * Importante: esto solo oculta la UI. El código de RiotKeyManager y el endpoint
 * /api/riot-key siguen intactos por si hacen falta de nuevo.
 */
export const SHOW_RIOT_KEY_UI =
  process.env.NEXT_PUBLIC_SHOW_RIOT_KEY_UI === 'true';