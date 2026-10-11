'use client';

import { Sparkles, TrendingUp, RefreshCw, Users } from 'lucide-react';
import { CompositionResult } from '@/lib/types';
import { useCachedFetch } from '@/hooks/useCachedFetch';
import { SkeletonCard, Skeleton } from './Skeleton';

const Spinner = ({ size = 'w-5 h-5', className = '' }: { size?: string; className?: string }) => (
  <svg className={`animate-spin ${size} ${className}`} viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

export default function CompositionPanel() {
  const {
    data,
    loading,
    refresh: load,
  } = useCachedFetch<CompositionResult>('/api/composition', {
    key: 'composition',
    ttl: 10 * 60 * 1000,
  });

  if (loading && !data) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Cargando composición">
        <div className="space-y-2">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-3 w-80" />
        </div>
        <SkeletonCard lines={3} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-700/50 bg-slate-900/40"
            >
              <Skeleton className="w-6 h-6 rounded" />
              <Skeleton className="h-3 flex-1" />
              <Skeleton className="h-4 w-10" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.scannedMatches === 0) {
    return (
      <div className="p-6 text-center text-slate-500 text-sm">
        No hay partidas suficientes para analizar composición.
      </div>
    );
  }

  const duos = data.champCombos.filter((c) => c.size === 2);
  const fullComps = data.champCombos.filter((c) => c.size === 5);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold flex items-center gap-2 text-white">
          <Sparkles className="w-5 h-5 text-pink-400" />
          Recomendador de Composición
        </h3>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium transition disabled:opacity-50"
        >
          {loading ? <Spinner size="w-3.5 h-3.5" /> : <RefreshCw className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">Actualizar</span>
        </button>
      </div>

      <p className="text-xs text-slate-400">
        Basado en {data.scannedMatches} partidas Flex históricas. Solo se muestran combos con 2+ partidas.
      </p>

      {/* Composiciones completas (5 checkpoints) */}
      {fullComps.length > 0 && (
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-3 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            Composiciones completas que les funcione
          </div>
          <div className="space-y-2">
            {fullComps.slice(0, 5).map((c, i) => (
              <div key={i} className="flex items-center gap-2 flex-wrap">
                <div className="flex gap-1">
                  {c.champions.map((ch, j) => (
                    <img
                      key={j}
                      src={`https://ddragon.leagueoflegends.com/cdn/14.20.1/img/champion/${ch}.png`}
                      alt={ch}
                      title={ch}
                      className="w-7 h-7 rounded-md border border-slate-700 bg-slate-800"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-black ${
                    c.winrate >= 60 ? 'text-emerald-400' : c.winrate >= 45 ? 'text-amber-400' : 'text-rose-400'
                  }`}>
                    {c.winrate}%
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {c.wins}V / {c.games} partidas
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mejores duos */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1 flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5" />
          Combos de campeones (pares)
        </div>
        <p className="text-[10px] text-slate-500 mb-3">
          Ordenado por confianza (más partidas primero). Un 100% en 2 partidas no dice nada.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {duos.slice(0, 12).map((c, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${
                c.winrate >= 60
                  ? 'bg-emerald-500/10 border-emerald-500/30'
                  : c.winrate >= 45
                  ? 'bg-amber-500/10 border-amber-500/30'
                  : 'bg-slate-800/50 border-slate-700/50'
              }`}
            >
              <div className="flex gap-0.5">
                {c.champions.map((ch, j) => (
                  <img
                    key={j}
                    src={`https://ddragon.leagueoflegends.com/cdn/14.20.1/img/champion/${ch}.png`}
                    alt={ch}
                    title={ch}
                    className="w-6 h-6 rounded border border-slate-700 bg-slate-800"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ))}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-slate-200 truncate">
                  {c.champions.join(' + ')}
                </div>
                <div className="text-[9px] text-slate-500 font-mono">{c.games} partidas</div>
              </div>
              <div className={`text-sm font-black shrink-0 ${
                c.winrate >= 60 ? 'text-emerald-400' : c.winrate >= 45 ? 'text-amber-400' : 'text-slate-400'
              }`}>
                {c.winrate}%
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Winrate por rol (posición real) */}
      {data.roleFills.length > 0 && (
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">
            Winrate de la squad por posición
          </div>
          <p className="text-[10px] text-slate-500 mb-3">
            Todas las partidas de la squad agrupadas por posición. No es por jugador.
          </p>
          <div className="space-y-1.5">
            {data.roleFills.map((r) => (
              <div key={r.role} className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-300 w-16">{r.role}</span>
                <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      r.winrate >= 60 ? 'bg-emerald-500' : r.winrate >= 45 ? 'bg-amber-500' : 'bg-rose-500'
                    }`}
                    style={{ width: `${r.winrate}%` }}
                  />
                </div>
                <span className="text-xs font-mono text-slate-400 w-10 text-right">{r.winrate}%</span>
                <span className="text-[9px] text-slate-600 font-mono w-14 text-right">{r.games} part.</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}