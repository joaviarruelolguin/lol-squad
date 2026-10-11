'use client';

import { Crown, TrendingUp, RefreshCw } from 'lucide-react';
import { PlayerMetrics } from '@/lib/types';

const Spinner = ({ size = 'w-5 h-5', className = '' }: { size?: string; className?: string }) => (
  <svg className={`animate-spin ${size} ${className}`} viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

interface PlayerMetricsCardProps {
  metric: PlayerMetrics;
  idx: number;
}

export default function PlayerMetricsCard({ metric: m, idx }: PlayerMetricsCardProps) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <img
            src={`https://ddragon.leagueoflegends.com/cdn/14.20.1/img/profileicon/${m.profileIconId}.png`}
            alt={m.gameName}
            className="w-10 h-10 rounded-lg border border-slate-600"
          />
          {idx === 0 && (
            <Crown className="w-4 h-4 text-amber-400 absolute -top-1.5 -right-1.5" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm text-white truncate">{m.gameName}</div>
          <div className="text-[10px] text-slate-500">&quot;{m.nickname}&quot;</div>
        </div>
        <div className="text-right">
          <div className={`text-lg font-black ${m.winrate >= 50 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {m.winrate}%
          </div>
          <div className="text-[10px] text-slate-500">winrate</div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-2">
        <div className="text-center">
          <div className="text-sm font-bold text-slate-200">{m.avgKDA}</div>
          <div className="text-[9px] text-slate-500 uppercase">KDA</div>
        </div>
        <div className="text-center">
          <div className="text-sm font-bold text-slate-200">{m.avgDamage > 0 ? `${(m.avgDamage / 1000).toFixed(1)}k` : '—'}</div>
          <div className="text-[9px] text-slate-500 uppercase">Daño</div>
        </div>
        <div className="text-center">
          <div className="text-sm font-bold text-slate-200">{m.avgVisionScore}</div>
          <div className="text-[9px] text-slate-500 uppercase">Visión</div>
        </div>
        <div className="text-center">
          <div className="text-sm font-bold text-slate-200">{m.avgCS}</div>
          <div className="text-[9px] text-slate-500 uppercase">CS</div>
        </div>
      </div>

      {/* Campeón más jugado */}
      {m.mostPlayedChampion && (
        <div className="flex items-center gap-2 bg-slate-900/50 rounded-lg px-2.5 py-1.5">
          <img
            src={`https://ddragon.leagueoflegends.com/cdn/14.20.1/img/champion/${m.mostPlayedChampion.name}.png`}
            alt={m.mostPlayedChampion.name}
            className="w-6 h-6 rounded"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-slate-200 truncate">
              {m.mostPlayedChampion.name}
            </div>
            <div className="text-[10px] text-slate-500">
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
              <img
                src={`https://ddragon.leagueoflegends.com/cdn/14.20.1/img/champion/${c.name}.png`}
                alt={c.name}
                className="w-4 h-4 rounded-sm"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <span className="text-[10px] text-slate-400">{c.games}</span>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-700/50">
        <span>{m.wins}V - {m.losses}D</span>
        <span>{m.totalGames} partidas</span>
      </div>
    </div>
  );
}
