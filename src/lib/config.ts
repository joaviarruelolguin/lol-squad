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