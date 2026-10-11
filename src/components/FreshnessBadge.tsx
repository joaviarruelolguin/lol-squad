/**
 * Indicador de frescura de datos: dice cuándo se cargaron por última vez.
 *
 * Verde = recién cargado, ámbar = vencido (>15 min), gris = fresco.
 */
export default function FreshnessBadge({
  fetchedAt,
  ttl,
}: {
  fetchedAt: number | null;
  ttl?: number;
}) {
  if (!fetchedAt) return null;
  const minutes = Math.floor((Date.now() - fetchedAt) / 60000);
  const stale = minutes > 15;

  return (
    <span
      className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
        minutes < 2
          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
          : stale
            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
            : 'bg-slate-800/60 text-slate-500 border-slate-700/60'
      }`}
      title={
        minutes === 0
          ? 'Datos recién cargados'
          : `Datos de hace ${minutes} minuto${minutes === 1 ? '' : 's'}`
      }
    >
      {minutes === 0 ? 'recién actualizado' : `hace ${minutes}m`}
    </span>
  );
}
