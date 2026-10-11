'use client';

import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  Legend,
} from 'recharts';
import { Trophy, Skull, Eye, Flame, TrendingUp, TrendingDown } from 'lucide-react';
import { PlayerStatsResult, PlayerAward, RoleStat, TiltData } from '@/lib/types';

const Spinner = ({ size = 'w-5 h-5', className = '' }: { size?: string; className?: string }) => (
  <svg className={`animate-spin ${size} ${className}`} viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

interface StatsTabProps {
  members: { id: string; gameName: string; nickname: string; profileIconId: number }[];
}

export default function StatsTab({ members }: StatsTabProps) {
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
    } catch (err) {
      setError('Error de red al cargar stats.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const memberById = (id: string) => members.find((m) => m.id === id);

  // Preparar datos para gráficos
  const roleChartData = stats?.roleStats.map((rs) => {
    const member = memberById(rs.memberId);
    return {
      name: member?.gameName || rs.memberId,
      rol: rs.role,
      winrate: rs.winrate,
      games: rs.games,
    };
  }) || [];

  const tiltChartData = stats?.tiltData.map((td) => {
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
  }, {} as Record<string, PlayerAward[]>) || {};

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-400 gap-3">
        <Spinner size="w-8 h-8" className="text-cyan-400" />
        <span className="text-sm">Calculando estadísticas...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-rose-500/10 border border-rose-500/40 rounded-lg px-3 py-2 text-rose-300 text-xs flex items-start gap-2">
        <span>{error}</span>
      </div>
    );
  }

  if (!stats || stats.awards.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500 text-sm">
        No hay estadísticas disponibles todavía.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Awards */}
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
                    <div className="text-[10px] text-slate-500">"{member.nickname}"</div>
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

      {/* Winrate por rol */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
        <h3 className="text-base font-bold flex items-center gap-2 text-white mb-4">
          <Flame className="w-5 h-5 text-orange-400" />
          Winrate por Rol
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={roleChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
              <XAxis dataKey="name" tick={{ fill: '#8b949e', fontSize: 12 }} />
              <YAxis tick={{ fill: '#8b949e', fontSize: 12 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '8px' }}
                labelStyle={{ color: '#e6edf3' }}
              />
              <Legend />
              <Bar dataKey="winrate" name="Winrate %" fill="#58a6ff" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tilt meter */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
        <h3 className="text-base font-bold flex items-center gap-2 text-white mb-4">
          <TrendingUp className="w-5 h-5 text-emerald-400" />
          Tilt Meter
          <span className="text-[10px] font-normal text-slate-500">
            (winrate después de victoria vs después de derrota)
          </span>
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={tiltChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
              <XAxis dataKey="name" tick={{ fill: '#8b949e', fontSize: 12 }} />
              <YAxis tick={{ fill: '#8b949e', fontSize: 12 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '8px' }}
                labelStyle={{ color: '#e6edf3' }}
              />
              <Legend />
              <Bar dataKey="Después de victoria" name="Después de victoria" fill="#3fb950" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Después de derrota" name="Después de derrota" fill="#f85149" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Resumen */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
        <h3 className="text-base font-bold flex items-center gap-2 text-white mb-3">
          <Eye className="w-5 h-5 text-cyan-400" />
          Resumen
        </h3>
        <div className="text-xs text-slate-400">
          {stats.totalMatches} partidas analizadas · {members.length} miembros
        </div>
      </div>
    </div>
  );
}
