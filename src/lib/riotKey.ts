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

  if (isSupabaseConfigured()) {
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
