'use client';

import { useState } from 'react';
import { championSquareUrl, profileIconUrl } from '@/lib/ddragonUrls';

type Kind = 'champion' | 'profileicon';

interface DDragonImageProps {
  kind: Kind;
  /** Nombre del campeón (para `champion`) o id de ícono (para `profileicon`). */
  value: string | number;
  /** Clases de tamaño y estilo. */
  className?: string;
  /** Tamaño intrínseco, para reservar el espacio y evitar layout shift. */
  size?: number;
  alt?: string;
  /** Texto de respaldo si la imagen no carga. */
  fallback?: string;
}

/**
 * Imagen de DDragon con fallback real.
 *
 * Antes cada componente repetía el `<img>` y, cuando la imagen no cargaba,
 * hacía `style.display = 'none'`. Eso dejaba huecos: si Riot saca el patch del
 * CDN, desaparecen 6 de cada 7 retratos y la UI queda con espacios vacíos sin
 * explicación.
 *
 * Acá si algo falla mostramos un placeholder con la inicial, que al menos ocupa
 * el lugar y se lee.
 */
export default function DDragonImage({
  kind,
  value,
  className = '',
  size = 32,
  alt = '',
  fallback,
}: DDragonImageProps) {
  const [failed, setFailed] = useState(false);

  const src =
    kind === 'champion'
      ? championSquareUrl(String(value))
      : profileIconUrl(Number(value));

  if (failed) {
    const label = fallback ?? String(value).charAt(0).toUpperCase();
    return (
      <span
        aria-hidden={alt ? undefined : 'true'}
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        className={`inline-flex items-center justify-center bg-slate-800 text-slate-400 font-bold select-none ${className}`}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}
      >
        {label}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
