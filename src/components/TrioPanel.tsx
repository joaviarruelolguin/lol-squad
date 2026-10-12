'use client';

import { useState } from 'react';
import { Users, RefreshCw, AlertTriangle, Clock } from 'lucide-react';
import { TrioResult, TrioStat } from '@/lib/types';
import { useCachedFetch } from '@/hooks/useCachedFetch';
import { SkeletonCard, Skeleton } from './Skeleton';
import Spinner from './Spinner';

const RATING_STYLE: Record<TrioStat['synergyRating'], {
  label: string;
  badge: string;
  border: string;
  bar: string;
}> = {
  GOD_TIER: {
    label: 'God Tier',
    badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    border: 'border-emerald-500/30 hover:border-emerald-500/50',
    bar: 'bg-emerald-500',
  },
  REGULAR: {
    label: 'Regular',
    badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    border: 'border-cyan-500/30 hover:border-cyan-500/50',
    bar: 'bg-cyan-500',
  },
  FRIA: {
    label: 'Fría',
    badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    border: 'border-amber-500/30 hover:border-amber-500/50',
    bar: 'bg-amber-500',
  },
  A_PULIR: {
    label: 'A pulir',
    badge: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    border: 'border-rose-500/30 hover:border-rose-500/50',
    bar: 'bg-rose-500',
  },
};

export default function TrioPanel() {
  const [filter, setFilter] = useState<'all' | 'GOD_TIER' | 'REGULAR' | 'FRIA' | 'A_PULIR'>('all');

  const {
    data,
    loading,
    refresh: load,
  } = useCachedFetch<TrioResult>('/api/trios', { key: 'trios', ttl: 10 * 60 * 1000 });

  if (loading && !data) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Cargando matriz de tríos">
        <div className="space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3 w-72" />
          <Skeleton className="h-2.5 w-64" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} avatar lines={4} />
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.trios.length === 0) {
    return (
      <div className="p-6 text-center text-slate-500 text-sm bg-slate-900/40 rounded-xl border border-slate-800">
        {data?.scannedMatches === 0
          ? 'No hay partidas con 3+ miembros de la squad para analizar tríos.'
          : 'No se encontraron tríos con 2+ partidas (se necesita historial).'}
      </div>
    );
  }

  // Rango de fechas de los datos analizados, para que se entienda que
    // "hace 22d" en una tarjeta no significa que el dato está viejo.
  const timestamps = data.trios.map((t) => t.lastPlayed).filter(Boolean);
  const newest = timestamps.length > 0 ? Math.max(...timestamps) : 0;
  const oldest = timestamps.length > 0 ? Math.min(...timestamps) : 0;
  const daysAgo = (ts: number) => Math.floor((Date.now() - ts) / 86400000);

  const counts = {
    all: data.trios.length,
    GOD_TIER: data.trios.filter((t) => t.synergyRating === 'GOD_TIER').length,
    REGULAR: data.trios.filter((t) => t.synergyRating === 'REGULAR').length,
    FRIA: data.trios.filter((t) => t.synergyRating === 'FRIA').length,
    A_PULIR: data.trios.filter((t) => t.synergyRating === 'A_PULIR').length,
  };

  const filtered = filter === 'all' ? data.trios : data.trios.filter((t) => t.synergyRating === filter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-base font-bold flex items-center gap-2 text-white">
          <Users className="w-5 h-5 text-pink-400" />
          Matriz de Tríos
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

      <div className="space-y-1">
        <p className="text-xs text-slate-400">
          {data.scannedMatches} partidas analizadas · {data.trios.length} tríos con 2+ partidas
        </p>
        {newest > 0 && (
          <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            Datos del {daysAgo(newest) === 0 ? 'día de hoy' : `hace ${daysAgo(newest)} días`}
            {daysAgo(oldest) !== daysAgo(newest) && (
              <> (tríos más antiguos: hace {daysAgo(oldest)} días)</>
            )}
            <span className="text-slate-500">· ordenados por winrate, no por fecha</span>
          </p>
        )}
        <p className="text-[11px] text-slate-500">
          El winrate del trío puede ser más alto que el individual: cuenta solo las partidas
          donde esos tres jugaron juntos.
        </p>
      </div>

      {/* Filtros */}
      <div className="flex gap-1.5 flex-wrap">
        {(['all', 'GOD_TIER', 'REGULAR', 'FRIA', 'A_PULIR'] as const).map((f) => {
          const label = f === 'all' ? 'Todos' : RATING_STYLE[f].label;
          const count = counts[f];
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              disabled={count === 0 && f !== 'all'}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition border disabled:opacity-40 ${
                filter === f
                  ? 'bg-slate-700 text-slate-100 border-slate-600'
                  : 'bg-slate-800/50 text-slate-400 border-slate-700/50 hover:text-slate-200'
              }`}
            >
              {label} ({count})
            </button>
          );
        })}
      </div>

      {/* Lista de tríos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.map((t, i) => {
          const style = RATING_STYLE[t.synergyRating];
          const lastPlayedDays = t.lastPlayed
            ? Math.floor((Date.now() - t.lastPlayed) / 86400000)
            : null;

          return (
            <div
              key={t.memberIds.join('|')}
              className={`bg-slate-900/50 border rounded-xl p-3 transition ${style.border}`}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-2.5">
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${style.badge}`}>
                  {style.label}
                </span>
                <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
                  {lastPlayedDays !== null && (
                    <span className="flex items-center gap-0.5" title="Última partida juntos">
                      <Clock className="w-3 h-3" />
                      {lastPlayedDays === 0 ? 'hoy' : `hace ${lastPlayedDays}d`}
                    </span>
                  )}
                  <span className="text-slate-500">{t.totalGames} juntos</span>
                </div>
              </div>

              {/* Miembros */}
              <div className="space-y-1 mb-3">
                {t.memberNames.map((m, j) => (
                  <div key={j} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-600 shrink-0" />
                    <span className="text-xs font-semibold text-slate-200 truncate">{m.name}</span>
                    {m.nickname && (
                      <span className="text-[10px] text-pink-400 italic truncate hidden sm:inline">
                        "{m.nickname}"
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Winrate */}
              <div className="border-t border-slate-800 pt-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] text-slate-400">Winrate del trío</span>
                  <span className="text-lg font-black text-slate-100">{t.winrate}%</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${style.bar}`}
                    style={{ width: `${t.winrate}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-1.5 text-[10px] text-slate-500 font-mono">
                  <span className="text-emerald-400/80">{t.wins} ganadas</span>
                  <span className="text-slate-500">
                    {t.wins}V{t.losses}D de {t.totalGames}
                  </span>
                  <span className="text-rose-400/80">{t.losses} perdidas</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Nota */}
      <div className="flex items-start gap-2 text-[10px] text-slate-500 bg-slate-900/40 border border-slate-800 rounded-lg px-3 py-2">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          Un trío con 2 partidas al 100% no dice mucho. Priorizá los tríos con{" "}
          <b>5+ partidas</b> antes de sacar conclusiones.
        </span>
      </div>
    </div>
  );
}