'use client';

import { memo } from 'react';
import { Crown } from 'lucide-react';
import { PlayerMetrics } from '@/lib/types';
import DDragonImage from './DDragonImage';

interface PlayerMetricsCardProps {
  metric: PlayerMetrics;
  idx: number;
}

/**
 * Tarjeta de métricas de un jugador.
 *
 * Memoizada: se renderiza una por jugador dentro de un grid, y el padre lo
 * re-renderiza cada vez que cambia cualquier otra métrica de la lista.
 */
export default memo(function PlayerMetricsCard({ metric: m, idx }: PlayerMetricsCardProps) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <DDragonImage
            kind="profileicon"
            value={m.profileIconId}
            size={40}
            alt=""
            className="w-10 h-10 rounded-lg border border-slate-600 object-cover"
          />
          {idx === 0 && (
            <Crown className="w-4 h-4 text-amber-400 absolute -top-1.5 -right-1.5" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm text-white truncate">{m.gameName}</div>
          <div className="text-[11px] text-slate-400">&quot;{m.nickname}&quot;</div>
        </div>
        <div className="text-right">
          <div className={`text-lg font-black ${m.winrate >= 50 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {m.winrate}%
          </div>
          <div className="text-[11px] text-slate-400">winrate</div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-2">
        <div className="text-center">
          <div className="text-sm font-bold text-slate-200">{m.avgKDA}</div>
          <div className="text-[10px] text-slate-400 uppercase">KDA</div>
        </div>
        <div className="text-center">
          <div className="text-sm font-bold text-slate-200">{m.avgDamage > 0 ? `${(m.avgDamage / 1000).toFixed(1)}k` : '—'}</div>
          <div className="text-[10px] text-slate-400 uppercase">Daño</div>
        </div>
        <div className="text-center">
          <div className="text-sm font-bold text-slate-200">{m.avgVisionScore}</div>
          <div className="text-[10px] text-slate-400 uppercase">Visión</div>
        </div>
        <div className="text-center">
          <div className="text-sm font-bold text-slate-200">{m.avgCS}</div>
          <div className="text-[10px] text-slate-400 uppercase">CS</div>
        </div>
      </div>

      {/* Campeón más jugado */}
      {m.mostPlayedChampion && (
        <div className="flex items-center gap-2 bg-slate-900/50 rounded-lg px-2.5 py-1.5">
          <DDragonImage
            kind="champion"
            value={m.mostPlayedChampion.name}
            size={24}
            alt=""
            className="w-6 h-6 rounded object-cover"
          />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-slate-200 truncate">
              {m.mostPlayedChampion.name}
            </div>
            <div className="text-[11px] text-slate-400">
              {m.mostPlayedChampion.games} partidas · {m.mostPlayedChampion.winrate}% WR
            </div>
          </div>
        </div>
      )}

      {/* Pool de campeones */}
      {m.championPool.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {m.championPool.slice(0, 4).map((c) => (
            <div
              key={c.name}
              className="flex items-center gap-1 bg-slate-900/50 rounded px-1.5 py-0.5"
              title={`${c.name}: ${c.games} partidas, ${c.winrate}% WR`}
            >
              <DDragonImage
                kind="champion"
                value={c.name}
                size={16}
                alt=""
                className="w-4 h-4 rounded-sm object-cover"
              />
              <span className="text-[11px] text-slate-300">{c.games}</span>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-700/50">
        <span>{m.wins}V - {m.losses}D</span>
        <span>{m.totalGames} partidas</span>
      </div>
    </div>
  );
});
