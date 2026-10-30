import fs from 'fs';
import path from 'path';
import { getSupabase, isSupabaseConfigured } from './supabase';

const DATA_DIR = path.join(process.cwd(), 'data');
const KEY_FILE = path.join(DATA_DIR, 'riot-key.json');
const ENV_FILE = path.join(process.cwd(), '.env.local');

export interface RiotKeyMeta {
  key: string;
  setAt: string;
}

// Caché para no consultar la DB en cada request a Riot
let cache: { meta: RiotKeyMeta; expiresAt: number } | null = null;
const CACHE_TTL = 30_000; // 30 segundos

// Para emitir una sola vez el aviso de "entorno y Supabase no coinciden".
let overrideWarningDone = false;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// ---------- Fallback: archivo local (desarrollo sin Supabase) ----------
function fileGetKeyMeta(): RiotKeyMeta | null {
  ensureDataDir();
  if (!fs.existsSync(KEY_FILE)) {
    const envKey = process.env.RIOT_API_KEY;
    if (envKey) {
      return { key: envKey, setAt: new Date().toISOString() };
    }
    return null;
  }
  try {
    const raw = fs.readFileSync(KEY_FILE, 'utf-8');
    const meta = JSON.parse(raw) as RiotKeyMeta;
    return meta?.key ? meta : null;
  } catch {
    return null;
  }
}

function fileSetRiotKey(key: string): RiotKeyMeta {
  const meta: RiotKeyMeta = { key, setAt: new Date().toISOString() };
  ensureDataDir();
  fs.writeFileSync(KEY_FILE, JSON.stringify(meta, null, 2));
  // También actualizamos .env.local para persistencia entre reinicios
  updateEnvFile(key);
  return meta;
}

function updateEnvFile(key: string) {
  try {
    let content = '';
    if (fs.existsSync(ENV_FILE)) {
      content = fs.readFileSync(ENV_FILE, 'utf-8');
    }
    const lines = content.split('\n');
    const idx = lines.findIndex((l) => l.trim().startsWith('RIOT_API_KEY='));
    if (idx >= 0) {
      lines[idx] = `RIOT_API_KEY=${key}`;
    } else {
      if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('');
      lines.push(`RIOT_API_KEY=${key}`);
    }
    fs.writeFileSync(ENV_FILE, lines.join('\n'));
  } catch (err) {
    console.warn('No se pudo actualizar .env.local:', err);
  }
}

// ---------- API pública (híbrida) ----------
export async function getKeyMeta(): Promise<RiotKeyMeta | null> {
  // Caché en memoria
  if (cache && Date.now() < cache.expiresAt) {
    return cache.meta;
  }

  let meta: RiotKeyMeta | null = null;

  // La variable de entorno manda; Supabase queda como respaldo.
  //
  // Antes iba al revés y eso produjo un bug silencioso en producción: alguien
  // guardó una key desde la UI, quedó en la tabla riot_key, y a partir de ese
  // momento RIOT_API_KEY dejó de mirarse. Un deploy nuevo con la key correcta
  // en el entorno no la usaba, mientras el portal de Riot mostraba la key
  // aprobada y la app seguía recibiendo 401 con la vieja. Dos fuentes de verdad,
  // una sola mirada y ningún aviso: la única señal era el badge de la barra de
  // la API key, que es la que se ocultó.
  //
  // La variable de entorno es la que define el deployment: en Vercel es lo que
  // cargaste en Project Settings y en local el .env.local. Tiene que poder
  // imponerse sin que nadie tenga que tocar una base de datos.
  const envKey = process.env.RIOT_API_KEY;

  if (envKey) {
    meta = { key: envKey, setAt: new Date().toISOString() };
    await warnIfSupabaseHasADifferentKey(envKey);
  } else if (isSupabaseConfigured()) {
    const { data, error } = await getSupabase()
      .from('riot_key')
      .select('api_key, set_at')
      .eq('id', 1)
      .single();
    if (error) {
      console.warn('Supabase getKeyMeta error:', error.message);
      meta = fileGetKeyMeta();
    } else if (data) {
      meta = { key: data.api_key, setAt: data.set_at };
    } else {
      meta = fileGetKeyMeta();
    }
  } else {
    meta = fileGetKeyMeta();
  }

  if (meta) {
    cache = { meta, expiresAt: Date.now() + CACHE_TTL };
  }
  return meta;
}

/**
 * Avisa cuando el entorno y Supabase guardan keys distintas.
 *
 * Sin esto, poner una key en Vercel "no hace nada" y no se entiende por qué,
 * que es exactamente el estado que dejó el bug de arriba. Sale por console.warn,
 * así que aparece en los logs de Vercel.
 *
 * Se emite una sola vez por proceso. En serverless cada instancia fría lo tira
 * una vez: suficiente para que se vea en los logs sin repetir lo mismo cada 30
 * segundos, que es lo que dura la caché de la key.
 */
async function warnIfSupabaseHasADifferentKey(envKey: string): Promise<void> {
  if (overrideWarningDone || !isSupabaseConfigured()) return;
  overrideWarningDone = true;

  try {
    const { data, error } = await getSupabase()
      .from('riot_key')
      .select('api_key')
      .eq('id', 1)
      .single();

    if (!error && data?.api_key && data.api_key !== envKey) {
      console.warn(
        `riotKey: RIOT_API_KEY (${maskKey(envKey)}) está poniendo fuera de ` +
          `servicio la key guardada en Supabase (${maskKey(data.api_key)}), ` +
          'que no se va a usar. Si querés que mande la de Supabase, vaciá ' +
          'RIOT_API_KEY en el entorno y redeployá.'
      );
    }
  } catch {
    // Es solo diagnóstico: si no se puede consultar, seguimos con la de entorno.
  }
}

export async function getRiotKey(): Promise<string> {
  const meta = await getKeyMeta();
  return meta?.key || process.env.RIOT_API_KEY || '';
}

export async function setRiotKey(key: string): Promise<RiotKeyMeta> {
  const meta: RiotKeyMeta = { key, setAt: new Date().toISOString() };

  if (isSupabaseConfigured()) {
    const { error } = await getSupabase()
      .from('riot_key')
      .upsert({ id: 1, api_key: key, set_at: meta.setAt }, { onConflict: 'id' });
    if (error) {
      console.warn('Supabase setRiotKey error:', error.message);
      fileSetRiotKey(key);
    }
  } else {
    fileSetRiotKey(key);
  }

  // Guardar no alcanza si el entorno define RIOT_API_KEY: getKeyMeta() le da
  // prioridad al entorno, así que esta key recién guardada no se va a usar.
  // Lo avisamos porque si no es el clásico "lo guardé y no pasó nada".
  if (process.env.RIOT_API_KEY && process.env.RIOT_API_KEY !== key) {
    console.warn(
      `riotKey: se guardó ${maskKey(key)} pero RIOT_API_KEY del entorno ` +
        `(${maskKey(process.env.RIOT_API_KEY)}) tiene prioridad y es la que ` +
        'se va a usar. Vaciala del entorno para que mande la recién guardada.'
    );
  }

  // Actualizamos la caché inmediatamente
  cache = { meta, expiresAt: Date.now() + CACHE_TTL };
  return meta;
}

/** Máscara para mostrar la key sin revelarla completa */
export function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 12) return '••••••';
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}
