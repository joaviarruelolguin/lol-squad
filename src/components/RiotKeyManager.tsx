'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CircleCheck, KeyRound, XCircle } from 'lucide-react';

interface RiotKeyMeta {
  configured: boolean;
  isExpired: boolean;
  remainingHours: number;
  ageHours: number;
  expiresAt: string | null;
}

/** Cada cuánto revisamos el estado de la key. */
const POLL_MS = 60_000;

/**
 * Barra de estado de la API key de Riot + modal para cambiarla.
 *
 * ⚠️ ESTE COMPONENTE ESTÁ OCULTO POR DEFECTO, PERO SIGUE FUNCIONANDO.
 *
 * No se eliminó: se eligió no montarlo. page.tsx lo renderiza condicionalmente
 * según SHOW_RIOT_KEY_UI (src/lib/config.ts), que es opt-in (default: oculta).
 * Si estás viendo este archivo y no aparece en la UI, no es un bug ni código
 * huérfano. Para activarlo, definí NEXT_PUBLIC_SHOW_RIOT_KEY_UI=true en el
 * entorno (Vercel o .env.local) y redeployá: las NEXT_PUBLIC_ se inlinean en
 * build, así que un cambio en caliente no alcanza.
 *
 * El endpoint /api/riot-key que usa abajo tampoco se tocó.
 *
 * Motivo de ocultarlo: cuando la key ya viene dada por variable de entorno,
 * esta barra suma ruido y encima sondea el estado cada 60s sin que nadie la
 * mire. Se mantiene para deployments donde haya que cargarla o renovarla
 * desde la interfaz (las keys de desarrollo de Riot vencen cada 24h) sin
 * tocar el deploy.
 *
 * Las keys de desarrollo vencen cada 24h, así que el componente sondea el
 * estado para tener el contador al día. Cuando guardás una key nueva llama a
 * `onKeyChanged` para que la página recargue todo.
 *
 * El sondeo se pausa cuando la pestaña está oculta: no hay nada que mirar si
 * nadie la está viendo, y con varias pestañas abiertas el tráfico se multiplica
 * sin necesidad.
 */
export default function RiotKeyManager({
  onKeyChanged,
}: {
  onKeyChanged: () => Promise<void> | void;
}) {
  const [meta, setMeta] = useState<RiotKeyMeta | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null
  );

  // Para devolver el foco al botón que abrió el modal al cerrarlo.
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const fetchMeta = useCallback(async () => {
    try {
      const res = await fetch('/api/riot-key').then((r) => r.json());
      setMeta(res);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      timer = setInterval(fetchMeta, POLL_MS);
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };

    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        // Al volver a la pestaña, el contador puede estar viejo: refrescamos.
        fetchMeta();
        start();
      }
    };

    fetchMeta();
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchMeta]);

  // Cerrar el modal con Escape. Antes solo se cerraba clicking el fondo.
  useEffect(() => {
    if (!modalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setModalOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [modalOpen]);

  const openModal = useCallback(() => {
    setMessage(null);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    triggerRef.current?.focus();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyInput.trim()) return;
    try {
      setVerifying(true);
      setMessage(null);
      const res = await fetch('/api/riot-key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: keyInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({
          ok: false,
          text: data.error || 'No se pudo guardar',
        });
        return;
      }
      setMessage({ ok: true, text: data.message || 'Guardada correctamente' });
      setKeyInput('');
      await fetchMeta();
      await onKeyChanged();
    } catch {
      setMessage({ ok: false, text: 'Error de red' });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <>
      <div className="border-b border-slate-800 bg-slate-900/40">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {meta?.configured ? (
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-full border ${
                  meta.isExpired
                    ? 'bg-rose-500/10 text-rose-300 border-rose-500/40 animate-pulse'
                    : meta.remainingHours < 3
                      ? 'bg-amber-500/10 text-amber-300 border-amber-500/40'
                      : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                }`}
                title={
                  meta.expiresAt
                    ? `Vence: ${new Date(meta.expiresAt).toLocaleString('es-AR')}`
                    : ''
                }
              >
                <KeyRound className="w-3.5 h-3.5" />
                {meta.isExpired
                  ? 'API key vencida'
                  : `API key · hace ${meta.ageHours}h`}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-full border bg-rose-500/10 text-rose-300 border-rose-500/40">
                <KeyRound className="w-3.5 h-3.5" />
                Sin API key de Riot
              </span>
            )}
            <button
              ref={triggerRef}
              onClick={openModal}
              className="text-xs font-semibold text-cyan-300 hover:text-cyan-200 transition"
            >
              {meta?.configured ? 'Cambiar' : 'Agregar'} API key
            </button>
          </div>
          <div className="text-[11px] text-slate-400 font-mono hidden md:block">
            Las keys de desarrollo de Riot vencen cada 24h
          </div>
        </div>
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="riot-key-title"
            className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3
                id="riot-key-title"
                className="text-lg font-bold text-white flex items-center gap-2"
              >
                <KeyRound className="w-5 h-5 text-cyan-400" aria-hidden="true" />
                API Key de Riot
              </h3>
              <button
                onClick={closeModal}
                aria-label="Cerrar"
                className="text-slate-500 hover:text-slate-300"
              >
                <XCircle className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <ol className="text-xs text-slate-300 space-y-2 mb-4 list-decimal list-inside">
              <li>
                Entrá a{' '}
                <a
                  href="https://developer.riotgames.com"
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-400 underline"
                >
                  developer.riotgames.com
                </a>{' '}
                e iniciá sesión.
              </li>
              <li>
                En la sección <b>"API Key (Development)"</b> hacé clic en{' '}
                <b>Generate</b> (o copiá la key existente).
              </li>
              <li>
                Pegá la key abajo y hacé clic en <b>Verificar y guardar</b>.
              </li>
              <li className="text-slate-500">
                La key de desarrollo vence cada 24h: cuando el badge se ponga
                rojo, repetí el paso 2.
              </li>
            </ol>

            {message && (
              <div
                className={`mb-4 rounded-lg px-3 py-2 text-xs flex items-start gap-2 ${
                  message.ok
                    ? 'bg-emerald-500/10 border border-emerald-500/40 text-emerald-300'
                    : 'bg-rose-500/10 border border-rose-500/40 text-rose-300'
                }`}
              >
                {message.ok ? (
                  <CircleCheck className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{message.text}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-3">
              <input
                type="text"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="RGAPI-...."
                aria-label="API key de Riot"
                autoFocus
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
              />
              <button
                type="submit"
                disabled={verifying || !keyInput.trim()}
                className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg text-sm transition"
              >
                {verifying ? 'Verificando con Riot...' : 'Verificar y guardar'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
