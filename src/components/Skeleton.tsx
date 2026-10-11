import React from 'react';

/** Bloque base con el shimmer animado */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-md bg-slate-800/60 ${className}`}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-slate-700/40 to-transparent" />
    </div>
  );
}

/** Texto falso con ancho variable */
export function SkeletonText({
  lines = 3,
  className = '',
}: {
  lines?: number;
  className?: string;
}) {
  const widths = ['w-full', 'w-11/12', 'w-9/12', 'w-10/12', 'w-7/12'];
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3 ${widths[i % widths.length]}`} />
      ))}
    </div>
  );
}

/** Avatar circular */
export function SkeletonAvatar({ className = 'w-10 h-10' }: { className?: string }) {
  return <Skeleton className={`${className} rounded-full`} />;
}

/** Tarjeta genérica con header y líneas */
export function SkeletonCard({
  lines = 3,
  avatar = false,
  className = '',
}: {
  lines?: number;
  avatar?: boolean;
  className?: string;
}) {
  return (
    <div className={`bg-slate-900/50 border border-slate-800 rounded-xl p-4 space-y-3 ${className}`}>
      <div className="flex items-center gap-3">
        {avatar && <SkeletonAvatar />}
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-1/3" />
          <Skeleton className="h-2.5 w-1/4" />
        </div>
        <Skeleton className="h-6 w-14 rounded-full" />
      </div>
      <SkeletonText lines={lines} />
    </div>
  );
}

/** Placeholder de gráfico de barras horizontales */
export function SkeletonBars({ count = 5 }: { count?: number }) {
  const widths = ['w-4/5', 'w-3/5', 'w-full', 'w-2/3', 'w-3/4', 'w-1/2'];
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <Skeleton className="h-2.5 w-14 shrink-0" />
          <Skeleton className={`h-4 ${widths[i % widths.length]}`} />
        </div>
      ))}
    </div>
  );
}

/** Placeholder de tabla */
export function SkeletonTable({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-3">
          <SkeletonAvatar className="w-6 h-6" />
          {Array.from({ length: cols - 1 }).map((_, c) => (
            <Skeleton key={c} className={`h-3 ${c === 0 ? 'w-1/4' : 'w-1/8'}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Placeholder de gráfico grande (para los que usan recharts) */
export function SkeletonChart({ className = 'h-56' }: { className?: string }) {
  return (
    <div className={`flex items-end gap-2 p-2 ${className}`}>
      {[45, 70, 55, 85, 60, 75, 50].map((h, i) => (
        <Skeleton
          key={i}
          className="flex-1 rounded-t-md"
          // eslint-disable-next-line react/forbid-dom-props
        />
      ))}
    </div>
  );
}

/** Placeholder de dropdown */
export function SkeletonDropdown({ className = 'h-10' }: { className?: string }) {
  return <Skeleton className={`${className} w-full rounded-lg`} />;
}