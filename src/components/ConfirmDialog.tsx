'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Qué se pierde exactamente. Las acciones destructivas necesitan decirlo. */
  description: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}

/**
 * Confirmación para acciones destructivas.
 *
 * Reemplaza al `window.confirm` nativo, que no se puede estilizar, bloquea el
 * main thread, no se puede traducir y no es navegable con teclado: el foco se
 * queda donde estaba y un lector de pantalla no anuncia nada.
 *
 * El botón de confirmar recibe el foco al abrir (es la acción por defecto de la
 * diálogo), Escape cancela, y al cerrar el foco vuelve al elemento que la abrió.
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Eliminar',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    if (busy) return;
    onCancel();
    returnFocus.current?.focus?.();
  }, [busy, onCancel]);

  // Guardar quién tenía el foco antes de abrir, para devolverlo al cerrar.
  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  const handleConfirm = async () => {
    try {
      setBusy(true);
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={close}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-desc"
        className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <h3 id="confirm-title" className="text-lg font-bold text-white">
              {title}
            </h3>
            <p id="confirm-desc" className="text-sm text-slate-300 mt-1">
              {description}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={close}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            ref={confirmRef}
            onClick={handleConfirm}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm font-bold bg-rose-600 hover:bg-rose-500 text-white transition disabled:opacity-50 flex items-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Estado de confirmación con un único `confirm()` declarativo.
 *
 *   const confirm = useConfirm();
 *   if (await confirm({ title, description })) { hacerLaCosa(); }
 */
export function useConfirm() {
  const [state, setState] = useState<{
    title: string;
    description: string;
    confirmLabel?: string;
    resolve: (ok: boolean) => void;
  } | null>(null);

  const confirm = useCallback(
    (opts: { title: string; description: string; confirmLabel?: string }) =>
      new Promise<boolean>((resolve) => setState({ ...opts, resolve })),
    []
  );

  const settle = useCallback(
    (ok: boolean) => {
      setState((s) => {
        s?.resolve(ok);
        return null;
      });
    },
    []
  );

  const dialog = (
    <ConfirmDialog
      open={state !== null}
      title={state?.title ?? ''}
      description={state?.description ?? ''}
      confirmLabel={state?.confirmLabel}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  );

  return { confirm, dialog };
}
