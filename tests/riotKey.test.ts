import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { maskKey } from '@/lib/riotKey';

/**
 * Estado controlable de los módulos externos.
 *
 * Va en vi.hoisted porque vi.mock se izan por encima de los imports: si el
 * factory tocara variables declaradas más abajo, entraría en TDZ justo cuando
 * se evalúa el grafo de módulos.
 */
const ext = vi.hoisted(() => ({
  supabaseConfigured: false,
  supabaseRow: null as { api_key: string } | null,
}));

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: () => ext.supabaseConfigured,
  getSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () =>
            ext.supabaseRow
              ? { data: ext.supabaseRow, error: null }
              : { data: null, error: { message: 'Sin fila' } },
        }),
      }),
    }),
  }),
}));

// getKeyMeta lee data/riot-key.json del disco real. Sin este mock, un key file
// en la máquina que corre los tests haría fallar los que esperan "sin key".
vi.mock('fs', () => {
  const api = {
    existsSync: () => false,
    mkdirSync: () => undefined,
    readFileSync: () => '',
    writeFileSync: () => undefined,
  };
  return { ...api, default: api };
});

/**
 * La key de Riot es una credencial. Este módulo es lo único que la muestra al
 * usuario, así que un fallo acá significa key expuesta en pantalla.
 */
describe('maskKey', () => {
  const key = 'RGAPI-0123456789abcdef-0123-4567-89ab-cdef01234567';

  it('muestra el prefijo y los últimos 4 caracteres', () => {
    expect(maskKey(key)).toBe('RGAPI-...4567');
  });

  it('nunca devuelve la key completa', () => {
    expect(maskKey(key)).not.toBe(key);
    expect(maskKey(key)).not.toContain('0123456789abcdef');
  });

  it('no filtra la parte del medio (la larga)', () => {
    // Si el prefijo fuera más largo, el cuerpo se filtraría.
    const long = 'RGAPI-ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
    const masked = maskKey(long);
    expect(masked).not.toContain('MNOPQ');
  });

  it('devuelve vacío para una key vacía', () => {
    expect(maskKey('')).toBe('');
  });

  it('enmascara del todo una key demasiado corta', () => {
    // Con <= 12 caracteres no hay forma de mostrar prefijo y sufijo sin
    // exponer casi toda la key, así que se oculta entera.
    expect(maskKey('RGAPI-123')).toBe('••••••');
    expect(maskKey('012345678901')).toBe('••••••');
  });

  it('el límite de 12 caracteres decide entre mostrar u ocultar', () => {
    expect(maskKey('01234567890')).toBe('••••••'); // 11: oculta
    expect(maskKey('0123456789012')).not.toBe('••••••'); // 13: enmascara
  });

  it('nunca revela el cuerpo para una key corta', () => {
    // Todas de 11 caracteres o menos: la función las oculta enteras.
    for (const short of ['RGAPI-1', 'RGAPI-12345', '01234567890', 'RGAPI']) {
      expect(maskKey(short), short).toBe('••••••');
    }
  });

  it('la salida con puntos tiene siempre el mismo formato', () => {
    const masked = maskKey(key);
    expect(masked.split('...')).toHaveLength(2);
    expect(masked.split('...')[1]).toHaveLength(4);
  });
});

// ============================================================================
// getKeyMeta: qué fuente manda
// ============================================================================

/**
 * Este bloque existe por un bug que estuvo en producción.
 *
 * getKeyMeta miraba Supabase primero y la variable de entorno después. Alguien
 * guardó una key desde la UI, quedó en la tabla riot_key, y desde ese momento
 * RIOT_API_KEY se ignoró. Un deploy con la key correcta en el entorno no la
 * usaba: el portal de Riot mostraba la key aprobada mientras la app recibía
 * 401 con una vieja. Cuatro días de datos caídos y la única señal (el badge de
 * la barra de la API key) recién se había ocultado.
 *
 * El orden ahora es entorno > Supabase > archivo. No cambia sin test.
 */
describe('getKeyMeta: precedencia de fuentes', () => {
  const ENV_KEY = 'RGAPI-entorno-valida-0000';
  const DB_KEY = 'RGAPI-base-de-datos-vieja';

  const ORIGINAL = {
    RIOT_API_KEY: process.env.RIOT_API_KEY,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  function restoreEnv() {
    for (const [k, v] of Object.entries(ORIGINAL)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }

  /** Módulo recién importado: sin la caché de 30s ni el flag de aviso. */
  async function loadModule() {
    vi.resetModules();
    return await import('@/lib/riotKey');
  }

  beforeEach(() => {
    ext.supabaseConfigured = false;
    ext.supabaseRow = null;
    delete process.env.RIOT_API_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  it('la variable de entorno gana aunque Supabase tenga otra guardada', async () => {
    process.env.RIOT_API_KEY = ENV_KEY;
    ext.supabaseConfigured = true;
    ext.supabaseRow = { api_key: DB_KEY };

    const { getKeyMeta } = await loadModule();
    const meta = await getKeyMeta();

    expect(meta?.key).toBe(ENV_KEY);
    expect(meta?.key).not.toBe(DB_KEY);
  });

  it('sin variable de entorno, se usa lo que hay en Supabase', async () => {
    ext.supabaseConfigured = true;
    ext.supabaseRow = { api_key: DB_KEY };

    const { getKeyMeta } = await loadModule();
    const meta = await getKeyMeta();

    expect(meta?.key).toBe(DB_KEY);
  });

  it('sin ninguna de las dos, no hay key', async () => {
    const { getKeyMeta } = await loadModule();
    expect(await getKeyMeta()).toBeNull();
  });

  it('avisa cuando el entorno y Supabase guardan keys distintas', async () => {
    process.env.RIOT_API_KEY = ENV_KEY;
    ext.supabaseConfigured = true;
    ext.supabaseRow = { api_key: DB_KEY };

    const { getKeyMeta } = await loadModule();
    await getKeyMeta();

    // Sin este aviso, poner la key en el entorno "no hace nada" y no se entiende
    // por qué: era justo el estado que dejaba el bug.
    expect(console.warn).toHaveBeenCalledTimes(1);
    const msg = String(vi.mocked(console.warn).mock.calls[0][0]);
    expect(msg).toContain(maskKey(ENV_KEY));
    expect(msg).toContain(maskKey(DB_KEY));
  });

  it('no avisa cuando las dos coinciden', async () => {
    process.env.RIOT_API_KEY = ENV_KEY;
    ext.supabaseConfigured = true;
    ext.supabaseRow = { api_key: ENV_KEY };

    const { getKeyMeta } = await loadModule();
    await getKeyMeta();

    expect(console.warn).not.toHaveBeenCalled();
  });

  it('no va a consultar a Supabase si no está configurado', async () => {
    process.env.RIOT_API_KEY = ENV_KEY;
    ext.supabaseConfigured = false;

    const { getKeyMeta } = await loadModule();
    const meta = await getKeyMeta();

    expect(meta?.key).toBe(ENV_KEY);
    expect(console.warn).not.toHaveBeenCalled();
  });
});
