'use client';

import { TrendingUp, Clock, CalendarDays, Skull, RefreshCw, AlertTriangle, Flame } from 'lucide-react';
import { TrendResult, PlayerTrend } from '@/lib/types';
import { useCachedFetch } from '@/hooks/useCachedFetch';

const Spinner = ({ size = 'w-5 h-5', className = '' }: { size?: string; className?: string }) => (
  <svg className={`animate-spin ${size} ${className}`} viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

export default function TrendsPanel() {
  const {
    data,
    loading,
    refresh: load,
  } = useCachedFetch<TrendResult>('/api/trends', {
    key: 'trends',
    ttl: 15 * 60 * 1000,
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 gap-3 text-slate-400">
        <Spinner size="w-6 h-6" className="text-cyan-400" />
        <span className="text-sm">Analizando tendencias (esto puede tardar)...</span>
      </div>
    );
  }

  if (!data || data.trends.length === 0) {
    return (
      <div className="p-6 text-center text-slate-500 text-sm bg-slate-900/40 rounded-xl border border-slate-800">
        {data?.error || 'No hay datos suficientes para analizar tendencias.'}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-base font-bold flex items-center gap-2 text-white">
          <TrendingUp className="w-5 h-5 text-cyan-400" />
          Tendencias por Jugador
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
        {data.scannedMatches} partidas analizadas · patrones de muerte por minuto, franja horaria y día de la semana
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {data.trends.map((t) => (
          <TrendCard key={t.memberId} trend={t} />
        ))}
      </div>
    </div>
  );
}

function TrendCard({ trend: t }: { trend: PlayerTrend }) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <img
          src={`https://ddragon.leagueoflegends.com/cdn/14.20.1/img/profileicon/${t.profileIconId}.png`}
          alt={t.gameName}
          className="w-10 h-10 rounded-lg border border-slate-600"
        />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm text-white truncate">{t.gameName}</div>
          <div className="text-[10px] text-slate-500">&quot;{t.nickname}&quot;</div>
        </div>
        <div className="text-right">
          <div className={`text-lg font-black ${t.winrate >= 50 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {t.winrate}%
          </div>
          <div className="text-[10px] text-slate-500">{t.games} partidas</div>
        </div>
      </div>

      {/* Sin datos suficientes */}
      {!t.hasEnoughData && (
        <div className="flex items-center gap-1.5 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1">
          <AlertTriangle className="w-3 h-3" />
          Faltan partidas para detectar patrones (mín. {5})
        </div>
      )}

      {/* Últimos 10 resultados */}
      <div>
        <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-1.5">
          Últimas 10 (izq. = más antigua)
        </div>
        <div className="flex gap-1">
          {t.last10Results.length > 0 ? (
            t.last10Results.map((won, i) => (
              <div
                key={i}
                className={`flex-1 h-5 rounded flex items-center justify-center text-[9px] font-bold ${
                  won
                    ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/40'
                    : 'bg-rose-500/30 text-rose-300 border border-rose-500/40'
                } ${i === t.last10Results.length - 1 ? 'ring-1 ring-white/30' : ''}`}
                title={won ? 'Victoria' : 'Derrota'}
              >
                {won ? 'V' : 'D'}
              </div>
            ))
          ) : (
            <span className="text-[10px] text-slate-600">Sin datos</span>
          )}
        </div>
      </div>

      {/* Racha actual */}
      {t.currentStreakLength >= 2 && (
        <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${
          t.currentStreakType === 'win'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
        }`}>
          <Flame className="w-3.5 h-3.5" />
          <span className="text-[11px] font-semibold">
            {t.currentStreakLength} {t.currentStreakType === 'win' ? 'victorias' : 'derrotas'} seguidas
          </span>
        </div>
      )}

      {/* Patrones */}
      <div className="grid grid-cols-2 gap-2">
        <PatternBox
          icon={<Skull className="w-3 h-3" />}
          label="Muere más entre"
          value={t.worstDeathWindow ? `min ${t.worstDeathWindow}` : '—'}
          highlight={Boolean(t.worstDeathWindow)}
        />
        <PatternBox
          icon={<Clock className="w-3 h-3" />}
          label="Peor franja"
          value={
            t.worstHour
              ? `${t.worstHour.hour}:00 (${t.worstHour.deathsPerGame} muer/part)`
              : '—'
          }
          highlight={Boolean(t.worstHour)}
        />
        <PatternBox
          icon={<CalendarDays className="w-3 h-3" />}
          label="Peor día"
          value={
            t.worstDay
              ? `${t.worstDay.name} (${t.worstDay.deathsPerGame})`
              : '—'
          }
          highlight={Boolean(t.worstDay)}
        />
        <PatternBox
          icon={<TrendingUp className="w-3 h-3" />}
          label="CS por min"
          value={t.csPerMinute.toFixed(1)}
          highlight={false}
        />
      </div>

      {/* Stats base */}
      <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-slate-800/50">
        <MiniStat label="K" value={t.avgKills} />
        <MiniStat label="D" value={t.avgDeaths} />
        <MiniStat label="A" value={t.avgAssists} />
        <MiniStat label="Daño" value={`${(t.avgDamage / 1000).toFixed(0)}k`} />
      </div>
    </div>
  );
}

function PatternBox({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight: boolean;
}) {
  return (
    <div className={`px-2 py-1.5 rounded ${
      highlight ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-slate-900/40'
    }`}>
      <div className="flex items-center gap-1 text-[9px] text-slate-500 mb-0.5">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className={`text-[11px] font-bold ${highlight ? 'text-amber-300' : 'text-slate-300'}`}>
        {value}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="text-center">
      <div className="text-sm font-bold text-slate-200 font-mono">{value}</div>
      <div className="text-[9px] text-slate-500">{label}</div>
    </div>
  );
}