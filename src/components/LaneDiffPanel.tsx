'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { LaneDiffResult } from '@/lib/types';

const Spinner = ({ size = 'w-5 h-5', className = '' }: { size?: string; className?: string }) => (
  <svg className={`animate-spin ${size} ${className}`} viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

const LANE_NAMES: Record<string, string> = {
  TOP: 'Top',
  JUNGLE: 'Jungla',
  MID: 'Mid',
  MIDDLE: 'Mid',
  BOTTOM: 'Bot',
};

export default function LaneDiffPanel({ matchId }: { matchId: string }) {
  const [data, setData] = useState<LaneDiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!matchId) {
      setData(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/lane-diff?matchId=${matchId}`).then((r) => r.json());
        if (cancelled) return;
        if (res.error) {
          setError(res.error);
          setData(null);
        } else {
          setData(res);
        }
      } catch {
        if (!cancelled) setError('No se pudo cargar el diferencial.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [matchId]);

  if (!matchId) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-4 text-slate-400 text-xs">
        <Spinner size="w-4 h-4" />
        Calculando diferenciales de línea...
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-3 px-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300 text-xs">
        {error}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="border-t border-slate-800 pt-4 mt-4 space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        <TrendingUp className="w-3.5 h-3.5" />
        Diferenciales de línea (oro / XP)
        <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-black ${
          data.userTeamWon
            ? 'bg-emerald-500/20 text-emerald-300'
            : 'bg-rose-500/20 text-rose-300'
        }`}>
          {data.userTeamWon ? 'VICTORIA' : 'DERROTA'}
        </span>
      </div>

      {data.checkpoints.map((cp) => (
        <div key={cp.minute} className="bg-slate-900/50 border border-slate-800 rounded-lg p-2.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black text-slate-400 uppercase">
              Minuto {cp.minute}
            </span>
            <div className="flex items-center gap-3 text-[10px] font-mono">
              <DiffValue label="Oro" value={cp.goldDiff} />
              <DiffValue label="XP" value={cp.xpDiff} />
            </div>
          </div>

          {/* Barras comparativas */}
          <div className="space-y-1 mb-2">
            <CompareBar
              label="Oro"
              mine={cp.myGold}
              theirs={cp.theirGold}
              format={(v) => `${(v / 1000).toFixed(1)}k`}
            />
            <CompareBar
              label="XP"
              mine={cp.myXp}
              theirs={cp.theirXp}
              format={(v) => `${(v / 1000).toFixed(1)}k`}
            />
          </div>

          {/* Por lane */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {cp.laneBreakdown.map((lb) => (
              <div
                key={lb.lane}
                className={`px-1.5 py-1 rounded ${
                  lb.goldDiff >= 0
                    ? 'bg-emerald-500/10'
                    : 'bg-rose-500/10'
                }`}
                title={`${lb.ourPlayer} vs ${lb.theirPlayer}`}
              >
                <div className="text-[9px] text-slate-500 font-semibold">
                  {LANE_NAMES[lb.lane] || lb.lane}
                </div>
                <div className={`text-[11px] font-bold font-mono ${
                  lb.goldDiff >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  {lb.goldDiff >= 0 ? '+' : ''}{(lb.goldDiff / 1000).toFixed(1)}k
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DiffValue({ label, value }: { label: string; value: number }) {
  const positive = value >= 0;
  return (
    <span className="flex items-center gap-0.5">
      <span className="text-slate-500">{label}</span>
      {positive ? (
        <TrendingUp className="w-3 h-3 text-emerald-400" />
      ) : (
        <TrendingDown className="w-3 h-3 text-rose-400" />
      )}
      <span className={positive ? 'text-emerald-400' : 'text-rose-400'}>
        {positive ? '+' : ''}{(value / 1000).toFixed(1)}k
      </span>
    </span>
  );
}

function CompareBar({
  label,
  mine,
  theirs,
  format,
}: {
  label: string;
  mine: number;
  theirs: number;
  format: (v: number) => string;
}) {
  const total = mine + theirs || 1;
  const minePct = (mine / total) * 100;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] text-slate-500 w-6 shrink-0">{label}</span>
      <div className="flex-1 flex h-3 rounded overflow-hidden bg-slate-800">
        <div
          className="bg-emerald-500/70 h-full transition-all"
          style={{ width: `${minePct}%` }}
          title={`Nosotros: ${format(mine)}`}
        />
        <div
          className="bg-rose-500/70 h-full transition-all flex-1"
          title={`Rivales: ${format(theirs)}`}
        />
      </div>
      <div className="flex items-center gap-1 text-[9px] font-mono shrink-0">
        <span className="text-emerald-400">{format(mine)}</span>
        <span className="text-slate-600">vs</span>
        <span className="text-rose-400">{format(theirs)}</span>
      </div>
    </div>
  );
}