'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Crown, Medal, Sparkles, Trophy, TrendingUp, Flame, Snowflake } from 'lucide-react';
import type { MvpEntry, MvpResult } from '@/lib/types';
import { profileIconUrl, championSquareUrl } from '@/lib/ddragonUrls';
import { Skeleton } from './Skeleton';

/**
 * Banner del MVP semanal.
 *
 * Va arriba de la tabla de rankeds porque es lo primero que la squad quiere ver
 * al abrir la app: no "qué rango tiene cada uno" sino "quién se llevó el título
 * esta semana". El resto de las pestañas tienen sus propios números; este
 * bloque es el premio.
 */

const MEDALS = [
  { icon: '🥈', label: '2º', ring: 'ring-slate-400/40', text: 'text-slate-300' },
  { icon: '🥉', label: '3º', ring: 'ring-amber-700/50', text: 'text-amber-500' },
] as const;

/** Texto de la racha, con el color que le corresponde. */
function StreakChip({ streak }: { streak: MvpEntry['streak'] }) {
  if (!streak.type || streak.length === 0) return null;

  const winning = streak.type === 'win';
  const Icon = winning ? Flame : Snowflake;

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${
        winning
          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
          : 'bg-slate-500/10 text-slate-400 border-slate-600/40'
      }`}
    >
      <Icon className="w-3 h-3" />
      {streak.length} {winning ? 'ganando' : 'perdiendo'}
    </span>
  );
}

/** Los 5 últimos resultados como cuadraditos verde/rojo. */
function FormStreak({ results }: { results: boolean[] }) {
  if (results.length === 0) return null;
  return (
    <div className="flex items-center gap-1" title="Últimos resultados">
      {results.map((win, i) => (
        <span
          key={i}
          className={`w-2 h-2 rounded-[2px] ${
            win ? 'bg-emerald-500' : 'bg-rose-500/70'
          }`}
          title={win ? 'Victoria' : 'Derrota'}
        />
      ))}
    </div>
  );
}

/** Cuánto falta para que se renueve, en días y horas. */
function useCountdown(target: number): string | null {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => {
      const ms = target - Date.now();
      if (ms <= 0) {
        setLabel(null);
        return;
      }
      const days = Math.floor(ms / 86_400_000);
      const hours = Math.floor((ms % 86_400_000) / 3_600_000);
      const mins = Math.floor((ms % 3_600_000) / 60_000);

      // Cuando falta menos de una hora, mostrar minutos: "1d 0h" es menos útil
      // que "12 min" cuando quedan doce minutos.
      if (days === 0 && hours === 0) {
        setLabel(`${mins} min`);
      } else if (days === 0) {
        setLabel(`${hours} h ${mins} min`);
      } else {
        setLabel(`${days} d ${hours} h`);
      }
    };

    tick();
    // 30s alcanza: nadie mira un countdown al segundo, y evita que el banner
    // se re-renderice todo el tiempo sin motivo.
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [target]);

  return label;
}

/** Barra de una métrica del puntaje. */
function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold w-16 shrink-0">
        {label}
      </span>
      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] font-mono text-slate-400 w-9 text-right shrink-0">
        {value.toFixed(1)}
      </span>
    </div>
  );
}

function MvpSkeleton() {
  return (
    <div
      className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden"
      aria-busy="true"
      aria-label="Calculando el MVP de la semana"
    >
      <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2">
        <Skeleton className="h-5 w-5 rounded" />
        <Skeleton className="h-3 w-40" />
      </div>
      <div className="p-5 flex items-center gap-5">
        <Skeleton className="h-20 w-20 rounded-2xl shrink-0" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-3 w-32" />
          <div className="flex gap-2 pt-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-20 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MvpBanner() {
  const [data, setData] = useState<MvpResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/mvp');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch {
      setError('No se pudo calcular el MVP semanal.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const countdown = useCountdown(data?.window.renewsAt ?? 0);

  const windowLabel = useMemo(() => {
    if (!data) return '';
    const desde = new Date(data.window.start);
    const hasta = new Date(data.window.end);
    const fmt = (d: Date) => d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
    return `${fmt(desde)} → ${fmt(hasta)}`;
  }, [data]);

  if (loading) return <MvpSkeleton />;

  if (error) {
    return (
      <div className="bg-rose-500/10 border border-rose-500/40 rounded-xl px-4 py-3 text-rose-300 text-xs flex items-center justify-between gap-3">
        <span>{error}</span>
        <button
          onClick={load}
          className="shrink-0 underline underline-offset-2 hover:text-rose-200 font-semibold"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const mvp = data?.mvp ?? null;

  // Sin partidas suficientes en la ventana: no inventamos un ganador.
  if (!data || !mvp) {
    return (
      <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl px-5 py-4 flex items-center gap-3">
        <Trophy className="w-5 h-5 text-slate-500 shrink-0" />
        <div>
          <div className="text-sm font-semibold text-slate-300">Todavía no hay MVP</div>
          <p className="text-xs text-slate-500 mt-0.5">
            En cuanto la squad juegue 2 partidas en la semana, coronamos al mejor.
          </p>
        </div>
      </div>
    );
  }

  const parts = mvp.scoreBreakdown.parts;
  const runnerUps = data.podium.slice(1);
  const isNewCrown = data.previous && data.previous.memberId !== mvp.memberId;

  return (
    <section
      aria-labelledby="mvp-title"
      className="relative bg-gradient-to-br from-amber-500/10 via-slate-900/60 to-cyan-500/5 border border-amber-500/30 rounded-2xl overflow-hidden shadow-2xl shadow-amber-500/5"
    >
      {/* Brillo diagonal de fondo */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(251,191,36,0.12),transparent_55%)] pointer-events-none"
      />

      {/* Header */}
      <div className="relative flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b border-amber-500/20">
        <div className="flex items-center gap-2.5">
          <span className="relative flex items-center justify-center">
            <Trophy className="w-5 h-5 text-amber-400" />
            <span
              aria-hidden="true"
              className="absolute inset-0 rounded-full bg-amber-400/30 animate-ping opacity-60"
            />
          </span>
          <h2
            id="mvp-title"
            className="text-sm font-black uppercase tracking-widest text-amber-300"
          >
            MVP de la semana
          </h2>
          {mvp.lowSample && (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300/90 border border-amber-500/30"
              title="Jugó pocas partidas: el título es orientativo"
            >
              muestra chica
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
          <span>{windowLabel}</span>
          {countdown && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800/70 border border-slate-700 text-slate-300">
              <Sparkles className="w-3 h-3 text-violet-400" />
              se renueva en {countdown}
            </span>
          )}
        </div>
      </div>

      {/* Cuerpo: el ganador */}
      <div className="relative p-5 flex flex-col sm:flex-row items-start sm:items-center gap-5">
        <div className="relative shrink-0">
          <img
            src={profileIconUrl(mvp.profileIconId)}
            alt=""
            width={80}
            height={80}
            loading="lazy"
            decoding="async"
            className="w-20 h-20 rounded-2xl border-2 border-amber-400/60 object-cover shadow-lg shadow-amber-500/20"
          />
          <Crown
            className="absolute -top-4 -right-3 w-7 h-7 text-amber-400 drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]"
            aria-hidden="true"
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-2xl font-black text-white truncate">{mvp.gameName}</span>
            <span className="text-sm text-pink-400 italic truncate">"{mvp.nickname}"</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="inline-flex items-baseline gap-1 px-2.5 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300">
              <span className="text-[10px] uppercase font-bold tracking-wider opacity-70">
                Puntaje
              </span>
              <span className="text-base font-black font-mono tabular-nums">
                {mvp.score.toFixed(1)}
              </span>
            </span>
            <StreakChip streak={mvp.streak} />
            <FormStreak results={mvp.lastResults} />
            {mvp.champion && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
                <img
                  src={championSquareUrl(mvp.champion.name)}
                  alt=""
                  width={16}
                  height={16}
                  loading="lazy"
                  decoding="async"
                  className="w-4 h-4 rounded"
                />
                {mvp.champion.name} ×{mvp.champion.games}
              </span>
            )}
          </div>

          {/* Números */}
          <dl className="grid grid-cols-3 sm:grid-cols-5 gap-x-4 gap-y-2 mt-4">
            <Stat label="Partidas" value={String(mvp.games)} />
            <Stat label="WR" value={`${mvp.winrate}%`} tone={mvp.winrate >= 50 ? 'good' : 'bad'} />
            <Stat label="KDA" value={String(mvp.avgKDA)} />
            <Stat label="Daño" value={`${(mvp.avgDamage / 1000).toFixed(1)}k`} tone="cyan" />
            <Stat label="Visión" value={String(mvp.avgVision)} />
          </dl>
        </div>
      </div>

      {/* Podio y desglose */}
      <div className="relative px-5 pb-5 space-y-4">
        {isNewCrown && data.previous && (
          <p className="flex items-center gap-1.5 text-xs text-slate-400">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            Le ganó el título a{' '}
            <b className="text-slate-200">{data.previous.gameName}</b> (
            {data.previous.score.toFixed(1)} pts)
          </p>
        )}

        {runnerUps.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {runnerUps.map((entry, i) => {
              const medal = MEDALS[i];
              return (
                <span
                  key={entry.memberId}
                  className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-800/60 border border-slate-700/70 ring-1 ${medal.ring}`}
                >
                  <img
                    src={profileIconUrl(entry.profileIconId)}
                    alt=""
                    width={20}
                    height={20}
                    loading="lazy"
                    decoding="async"
                    className="w-5 h-5 rounded border border-slate-600"
                  />
                  <span className={`text-xs font-bold ${medal.text}`}>
                    {medal.label} {entry.gameName}
                  </span>
                  <span className="text-xs font-mono text-slate-300 tabular-nums">
                    {entry.score.toFixed(1)}
                  </span>
                </span>
              );
            })}
          </div>
        )}

        {/* Squad en la ventana */}
        <p className="text-[11px] text-slate-500 font-mono">
          {data.matchesInWindow} {data.matchesInWindow === 1 ? 'partida' : 'partidas'} · squad{' '}
          {data.squad.wins}V/{data.squad.losses}D ({data.squad.winrate}% WR)
        </p>

        <button
          onClick={() => setShowBreakdown((v) => !v)}
          aria-expanded={showBreakdown}
          className="text-[11px] font-semibold text-slate-400 hover:text-slate-200 transition inline-flex items-center gap-1"
        >
          <Medal className="w-3.5 h-3.5" />
          {showBreakdown ? 'Ocultar' : 'Ver'} cómo se calculó el puntaje
        </button>

        {showBreakdown && (
          <div className="space-y-2 pt-1">
            <ScoreBar label="Winrate" value={parts.winrate} max={35} />
            <ScoreBar label="KDA" value={parts.kda} max={25} />
            <ScoreBar label="Momentum" value={parts.momentum} max={15} />
            <ScoreBar label="Daño" value={parts.damageShare} max={15} />
            <ScoreBar label="Visión" value={parts.vision} max={10} />
            <p className="text-[10px] text-slate-500 pt-1 leading-relaxed">
              Puntaje bruto {mvp.scoreBreakdown.raw.toFixed(1)} sobre 100, ajustado por
              tamaño de muestra ({mvp.confidence.toFixed(0)}% de peso por {mvp.games}{' '}
              {mvp.games === 1 ? 'partida' : 'partidas'}): con pocas partidas el puntaje se
              acerca al promedio de la squad.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'good' | 'bad' | 'cyan';
}) {
  const color =
    tone === 'good'
      ? 'text-emerald-400'
      : tone === 'bad'
        ? 'text-rose-400'
        : tone === 'cyan'
          ? 'text-cyan-300'
          : 'text-slate-200';

  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
        {label}
      </dt>
      <dd className={`text-lg font-black font-mono tabular-nums ${color}`}>{value}</dd>
    </div>
  );
}
