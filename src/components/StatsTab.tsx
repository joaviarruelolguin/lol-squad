'use client';

import { useState, useEffect } from 'react';
import { Trophy, Eye, Flame, Swords, Target } from 'lucide-react';
import { PlayerStatsResult, PlayerMetrics } from '@/lib/types';
import {
  Skeleton,
  SkeletonCard,
  SkeletonBars,
} from './Skeleton';

const Spinner = ({ size = 'w-5 h-5', className = '' }: { size?: string; className?: string }) => (
  <svg className={`animate-spin ${size} ${className}`} viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

// Colores vívidos por jugador (se asignan por orden estable)
const PLAYER_COLORS = [
  '#f97316', // orange
  '#22d3ee', // cyan
  '#a855f7', // purple
  '#22c55e', // green
  '#ec4899', // pink
  '#eab308', // yellow
];

interface StatsTabProps {
  members: { id: string; gameName: string; nickname: string; profileIconId: number }[];
  metrics: PlayerMetrics[];
  metricsLoading: boolean;
}

export default function StatsTab({ members, metrics, metricsLoading }: StatsTabProps) {
  const [stats, setStats] = useState<PlayerStatsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/player-stats').then((r) => r.json());
      if (res.status === 'error') {
        setError(res.errors?.[0]?.message || 'No se pudieron cargar las stats.');
        setStats(null);
      } else {
        setStats(res);
      }
    } catch {
      setError('Error de red al cargar stats.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const memberById = (id: string) => members.find((m) => m.id === id);
  const colorFor = (index: number) => PLAYER_COLORS[index % PLAYER_COLORS.length];

  // Datos para gráficos de promedios (usando player-metrics)
  const avgDamageData = metrics.map((m, i) => ({
    name: m.gameName,
    value: Math.round(m.avgDamage / 100) / 10,
    fill: colorFor(i),
  }));

  const avgVisionData = metrics.map((m, i) => ({
    name: m.gameName,
    value: m.avgVisionScore,
    fill: colorFor(i),
  }));

  const avgCsData = metrics.map((m, i) => ({
    name: m.gameName,
    value: m.avgCS,
    fill: colorFor(i),
  }));

  const avgKdaData = metrics.map((m, i) => ({
    name: m.gameName,
    value: m.avgKDA,
    fill: colorFor(i),
  }));

  const avgGoldData = metrics.map((m, i) => ({
    name: m.gameName,
    value: Math.round(m.avgGold / 100) / 10,
    fill: colorFor(i),
  }));

  const damageShareData = metrics.map((m, i) => ({
    name: m.gameName,
    value: m.damageShare,
    fill: colorFor(i),
  }));

  // Tilt meter
  const tiltData = stats?.tiltData.map((td) => {
    const member = memberById(td.memberId);
    return {
      name: member?.gameName || td.memberId,
      'Después de victoria': td.afterWinWinrate,
      'Después de derrota': td.afterLossWinrate,
    };
  }) || [];

  const awardsByMember = stats?.awards.reduce((acc, award) => {
    if (!acc[award.memberId]) acc[award.memberId] = [];
    acc[award.memberId].push(award);
    return acc;
  }, {} as Record<string, import('@/lib/types').PlayerAward[]>) || {};

  const loadingAll = loading || metricsLoading;

  // Primera carga: mostramos la estructura completa con skeletons para que la
  // página no salte de tamaño cuando llegan los datos.
  if (loadingAll && !stats && metrics.length === 0) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Cargando estadísticas">
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
          <Skeleton className="h-5 w-44 mb-4" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i} avatar lines={2} />
            ))}
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
          <Skeleton className="h-5 w-48 mb-4" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3"
              >
                <Skeleton className="h-3 w-28 mb-3" />
                <SkeletonBars count={metrics.length || 4} />
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
          <Skeleton className="h-5 w-32 mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} lines={2} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Premios */}
      {!loading && stats && stats.awards.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
          <h3 className="text-base font-bold flex items-center gap-2 text-white mb-4">
            <Trophy className="w-5 h-5 text-amber-400" />
            Premios de la Squad
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {members.map((member) => {
              const memberAwards = awardsByMember[member.id] || [];
              if (memberAwards.length === 0) return null;
              return (
                <div key={member.id} className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <img
                      src={`https://ddragon.leagueoflegends.com/cdn/14.20.1/img/profileicon/${member.profileIconId}.png`}
                      alt={member.gameName}
                      className="w-8 h-8 rounded-lg border border-slate-600"
                    />
                    <div>
                      <div className="text-sm font-bold text-white">{member.gameName}</div>
                      <div className="text-[10px] text-slate-500">&quot;{member.nickname}&quot;</div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {memberAwards.map((award, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="text-lg">{award.emoji}</span>
                        <div>
                          <span className="font-semibold text-slate-200">{award.title}</span>
                          <span className="text-slate-400 ml-1">· {award.value}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Grid de gráficos de promedios */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold flex items-center gap-2 text-white">
            <Swords className="w-5 h-5 text-cyan-400" />
            Promedios por Jugador
          </h3>
          <span className="text-[10px] text-slate-500 font-mono">
            {metrics.length} jugadores · {stats?.totalMatches || 0} partidas
          </span>
        </div>

        {loadingAll ? (
          <div className="flex flex-col items-center justify-center p-8 gap-3 text-slate-400">
            <Spinner size="w-6 h-6" className="text-cyan-400" />
            <span className="text-sm">Calculando promedios...</span>
          </div>
        ) : metrics.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-sm">
            No hay métricas disponibles todavía.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <MiniBarChart title="Daño Promedio" icon={<Target className="w-3.5 h-3.5" />} unit="k" data={avgDamageData} />
            <MiniBarChart title="Visión Promedio" icon={<Eye className="w-3.5 h-3.5" />} unit="" data={avgVisionData} />
            <MiniBarChart title="CS Promedio" icon={<Swords className="w-3.5 h-3.5" />} unit="" data={avgCsData} />
            <MiniBarChart title="KDA Promedio" icon={<Flame className="w-3.5 h-3.5" />} unit="" data={avgKdaData} />
            <MiniBarChart title="Oro Promedio" icon={<Trophy className="w-3.5 h-3.5" />} unit="k" data={avgGoldData} />
            <MiniBarChart title="% del Daño del Equipo" icon={<Target className="w-3.5 h-3.5" />} unit="%" data={damageShareData} />
          </div>
        )}
      </div>

      {/* Tilt meter */}
      {!loading && tiltData.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
          <h3 className="text-base font-bold flex items-center gap-2 text-white mb-1">
            <Flame className="w-5 h-5 text-orange-400" />
            Tilt Meter
          </h3>
          <p className="text-xs text-slate-400 mb-4">
            ¿Rindes igual después de una derrota? Verde = después de <b className="text-emerald-400">ganar</b>, Rojo = después de <b className="text-red-400">perder</b>.
          </p>
          <div className="space-y-2.5 mb-3">
            {tiltData.map((row, i) => {
              const w = row['Después de victoria'];
              const l = row['Después de derrota'];
              const gap = w != null && l != null ? w - l : null;
              return (
                <div key={i} className="bg-slate-800/40 border border-slate-700/40 rounded-lg p-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold text-slate-200">{row.name}</span>
                    {gap != null && (
                      <span className={`text-[9px] font-bold ${gap >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        gap {gap >= 0 ? '+' : ''}{gap}pp
                      </span>
                    )}
                  </div>
                  <TiltBar label="ganar" val={w} cls="bg-emerald-500" />
                  <TiltBar label="perder" val={l} cls="bg-rose-500" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/40 rounded-lg px-3 py-2 text-rose-300 text-xs">
          {error}
        </div>
      )}
    </div>
  );
}

// Barra horizontal simple para el tilt meter (más legible que un BarChart)
function TiltBar({ label, val, cls }: { label: string; val: number | null; cls: string }) {
  return (
    <div className="flex items-center gap-1.5 mt-0.5">
      <span className="text-[9px] text-slate-500 w-10 shrink-0">{label}</span>
      <div className="flex-1 h-2.5 bg-slate-900/60 rounded-full overflow-hidden">
        {val != null && (
          <div className={`h-full ${cls} rounded-full transition-all`} style={{ width: `${val}%` }} />
        )}
      </div>
      <span className="text-[9px] font-mono text-slate-400 w-8 text-right shrink-0">
        {val != null ? `${val}%` : '—'}
      </span>
    </div>
  );
}

// Gráfico de barras mini con colores por jugador
function MiniBarChart({
  title,
  icon,
  unit,
  data,
}: {
  title: string;
  icon: React.ReactNode;
  unit: string;
  data: { name: string; value: number; fill: string }[];
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-3 text-slate-300">
        {icon}
        <span className="text-[11px] font-semibold">{title}</span>
        {unit && <span className="text-[9px] text-slate-500">({unit})</span>}
      </div>
      <div className="space-y-2">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400 w-14 truncate shrink-0" title={d.name}>
              {d.name.length > 8 ? `${d.name.slice(0, 7)}…` : d.name}
            </span>
            <div className="flex-1 h-4 bg-slate-900/60 rounded overflow-hidden">
              <div
                className="h-full rounded transition-all duration-500 flex items-center justify-end pr-1"
                style={{
                  width: `${Math.max(3, (d.value / max) * 100)}%`,
                  backgroundColor: d.fill,
                }}
              >
                <span className="text-[9px] font-bold text-white/90">
                  {d.value >= 1000 ? `${(d.value / 1000).toFixed(1)}k` : Math.round(d.value * 10) / 10}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}