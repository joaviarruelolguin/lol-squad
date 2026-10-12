'use client';

import { useState } from 'react';
import { Check, Share2 } from 'lucide-react';
import { APP_TITLE } from '@/lib/config';

/**
 * Botón para compartir la app.
 *
 * En celular usa la API de share nativa, que abre la hoja de compartir del
 * sistema (WhatsApp, Telegram, etc.) con la URL ya cargada. En desktop cae a
 * copiar al portapapeles, porque Web Share no existe ahí.
 *
 * Cuando comparten el link, WhatsApp/Telegram levantan la preview con el
 * título, la descripción y la imagen que definen los metadatos Open Graph.
 */
export default function ShareButton() {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = window.location.origin;
    const text = `${APP_TITLE} — los stats de la squad`;

    // Native share: en Android/iOS abre la hoja del sistema.
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: APP_TITLE, text, url });
        return;
      } catch {
        // Si el usuario cancela, no hacemos nada. Si falla por otro motivo,
        // caemos al portapapeles.
      }
    }

    // Fallback: copiar al portapapeles.
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin permiso de portapapeles: al menos que puedan copiar a mano.
      window.prompt('Copiá el link:', url);
    }
  };

  return (
    <button
      onClick={handleShare}
      className="p-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center gap-1.5 text-sm"
      title="Compartir por WhatsApp o copiar el link"
      aria-label="Compartir"
    >
      {copied ? (
        <Check className="w-4 h-4" />
      ) : (
        <Share2 className="w-4 h-4" />
      )}
      <span className="hidden sm:inline">{copied ? 'Copiado' : 'Compartir'}</span>
    </button>
  );
}
