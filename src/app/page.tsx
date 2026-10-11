'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Trophy,
  Flame,
  Swords,
  PlusCircle,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Crown,
  Trash2,
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  Users,
  ShieldAlert,
  Zap,
  Database,
  Gamepad2,
  KeyRound,
  XCircle,
  CircleCheck,
  BarChart3,
  CalendarDays,
} from 'lucide-react';
import {
  MemberResult,
  DuoResult,
  CustomMatch,
  TableRow,
  PlayerMetrics,
} from '@/lib/types';
import { APP_TITLE, APP_SUBTITLE } from '@/lib/config';
import { clearAllFetchCache } from '@/hooks/useCachedFetch';
import StatsTab from '@/components/StatsTab';
import CompositionPanel from '@/components/CompositionPanel';
import TrioPanel from '@/components/TrioPanel';
import TrendsPanel from '@/components/TrendsPanel';
import WeeklyTab from '@/components/WeeklyTab';
import { Skeleton } from '@/components/Skeleton';
import Spinner from '@/components/Spinner';
import SectionHeader from '@/components/SectionHeader';
import FlexTab from '@/components/FlexTab';
import CustomsTab from '@/components/CustomsTab';
import { synergyVisual } from '@/components/synergyVisual';

export default function Home() {
  const [stats, setStats] = useState<MemberResult[]>([]);
  const [duoData, setDuoData] = useState<DuoResult | null>(null);
  const [customs, setCustoms] = useState<{
    matches: CustomMatch[];
    table: Record<string, TableRow>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'squad' | 'duos' | 'flex' | 'stats' | 'weekly' | 'customs'>('squad');
  const [cacheSize, setCacheSize] = useState<number | null>(null);
  const [forceRefreshing, setForceRefreshing] = useState(false);
  // Cuando cambia, FlexTab recarga partidas, métricas e historial de chat.
  const [flexRefreshKey, setFlexRefreshKey] = useState(0);

  // Métricas agregadas por jugador. Las usan dos pestañas (Flex y Estadísticas),
  // por eso viven en la página y no en FlexTab.
  const [playerMetrics, setPlayerMetrics] = useState<PlayerMetrics[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  // Form states
  const [gameName, setGameName] = useState('');
  const [tagLine, setTagLine] = useState('');
  const [nickname, setNickname] = useState('');
  const [role, setRole] = useState<'TOP' | 'JUNGLE' | 'MID' | 'ADC' | 'SUPPORT' | 'FILL'>('FILL');
  const [submitting, setSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // API Key de Riot (estado + countdown)
  const [riotKeyMeta, setRiotKeyMeta] = useState<any>(null);
  const [riotKeyModal, setRiotKeyModal] = useState(false);
  const [newKeyInput, setNewKeyInput] = useState('');
  const [keyVerifying, setKeyVerifying] = useState(false);
  const [keyMessage, setKeyMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [resStats, resDuos, resCustoms, resCache] = await Promise.all([
        fetch('/api/stats').then((r) => r.json()),
        fetch('/api/duos').then((r) => r.json()),
        fetch('/api/customs').then((r) => r.json()),
        fetch('/api/cache').then((r) => r.json()).catch(() => null),
      ]);
      setStats(resStats);
      setDuoData(resDuos);
      setCustoms(resCustoms);
      setCacheSize(resCache?.cachedEntries ?? null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    loadMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMetrics = useCallback(async () => {
    try {
      setMetricsLoading(true);
      setMetricsError(null);
      const res = await fetch('/api/player-metrics').then((r) => r.json());
      if (res.status === 'error') {
        setMetricsError(
          res.errors?.[0]?.message || 'No se pudieron calcular métricas.'
        );
        setPlayerMetrics([]);
      } else {
        setPlayerMetrics(res.metrics || []);
      }
    } catch {
      setMetricsError('Error de red al cargar métricas.');
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  // ---------- API Key de Riot ----------
  const fetchRiotKeyMeta = async () => {
    try {
      const res = await fetch('/api/riot-key').then((r) => r.json());
      setRiotKeyMeta(res);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchRiotKeyMeta();
    const interval = setInterval(fetchRiotKeyMeta, 60_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveRiotKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyInput.trim()) return;
    try {
      setKeyVerifying(true);
      setKeyMessage(null);
      const res = await fetch('/api/riot-key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: newKeyInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setKeyMessage({ ok: false, text: data.error || 'No se pudo guardar' });
        return;
      }
      setKeyMessage({ ok: true, text: data.message || 'Guardada correctamente' });
      setNewKeyInput('');
      await fetchRiotKeyMeta();
      await fetchData();
      await loadMetrics();
      setFlexRefreshKey((k) => k + 1);
    } catch (err) {
      setKeyMessage({ ok: false, text: 'Error de red' });
    } finally {
      setKeyVerifying(false);
    }
  };

  const handleForceRefresh = async () => {
    try {
      setForceRefreshing(true);
      // Limpiamos la caché de fetch del cliente para forrar todo
      clearAllFetchCache();
      // Limpiamos la caché de Riot en el servidor
      await fetch('/api/cache', { method: 'DELETE' }).catch(() => {});
      await fetchData();
      await loadMetrics();
      // FlexTab escucha este contador y recarga partidas e historial de chat.
      setFlexRefreshKey((k) => k + 1);
    } catch (err) {
      console.error(err);
    } finally {
      setForceRefreshing(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gameName || !tagLine) return;

    try {
      setSubmitting(true);
      setAddError(null);
      const res = await fetch('/api/squad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameName, tagLine, nickname, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error || 'No se pudo agregar el invocador');
        return;
      }
      setGameName('');
      setTagLine('');
      setNickname('');
      await fetchData();
    } catch (err) {
      setAddError('Error de red al agregar el invocador');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Seguro que querés sacar a este manco de la squad?')) return;
    try {
      await fetch(`/api/squad?id=${id}`, { method: 'DELETE' });
      await fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const getRankBadgeColor = (tier?: string) => {
    switch (tier?.toUpperCase()) {
      case 'CHALLENGER': return 'bg-amber-500/20 text-amber-300 border-amber-500/50';
      case 'GRANDMASTER': return 'bg-red-500/20 text-red-300 border-red-500/50';
      case 'MASTER': return 'bg-purple-500/20 text-purple-300 border-purple-500/50';
      case 'DIAMOND': return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50';
      case 'EMERALD': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50';
      case 'PLATINUM': return 'bg-teal-500/20 text-teal-300 border-teal-500/50';
      case 'GOLD': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50';
      case 'SILVER': return 'bg-slate-400/20 text-slate-300 border-slate-400/50';
      case 'BRONZE': return 'bg-orange-700/20 text-orange-400 border-orange-700/50';
      default: return 'bg-zinc-700/20 text-zinc-400 border-zinc-600/50';
    }
  };

  const memberById = (id: string) => stats.find((s) => s.member.id === id);

  // ---------- RENDER: tarjeta de miembro ----------
  const renderMemberCard = (item: MemberResult, idx: number) => {
    // Orientado a Flex: priorizamos el rango de Flexible
    const rank = item.flexQueue || item.soloQueue;
    const queueLabel = item.flexQueue ? 'FLEX' : item.soloQueue ? 'SOLOQ' : '';

    // Estado de error total: no pudimos resolver la identidad
    if (item.status === 'error' && !rank) {
      const errMsg =
        item.errors.account?.message ||
        item.errors.rank?.message ||
        'No se pudieron obtener datos de Riot.';
      return (
        <div
          key={item.member.id}
          className="bg-rose-950/20 border border-rose-800/50 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        >
          <div className="flex items-center gap-4">
            <div className="w-6 text-center text-rose-400 font-black">#{idx + 1}</div>
            <img
              src={`https://ddragon.leagueoflegends.com/cdn/14.20.1/img/profileicon/${item.member.profileIconId || 29}.png`}
              alt="icon"
              className="w-12 h-12 rounded-xl border border-rose-800/40 object-cover grayscale"
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-base">{item.member.gameName}</span>
                <span className="text-xs text-slate-400">#{item.member.tagLine}</span>
              </div>
              <div className="text-xs font-semibold text-pink-400 italic">"{item.member.nickname}"</div>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="flex items-start gap-2 text-rose-300 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Sin datos de Riot</div>
                <div className="text-xs text-rose-200/80">{errMsg}</div>
              </div>
            </div>
            <button
              onClick={() => handleDelete(item.member.id)}
              className="text-slate-500 hover:text-rose-400 transition p-1.5"
              title="Eliminar"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      );
    }

    // Tarjeta normal (ok o partial)
    return (
      <div
        key={item.member.id}
        className="bg-slate-900/60 border border-slate-800/80 hover:border-slate-700/80 rounded-xl overflow-hidden transition shadow-sm"
      >
        {/* Banner de advertencia si hay errores parciales */}
        {item.status === 'partial' && (
          <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 flex items-center gap-2 text-amber-300 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              Datos parciales:
              {item.errors.account && ' · identidad'}
              {item.errors.rank && ' · rango'}
              {item.errors.mastery && ' · campeones'}
              {' '}no disponibles.
            </span>
          </div>
        )}

        <div className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="text-lg font-black text-slate-500 w-6 text-center">
              {idx === 0 && rank ? <Crown className="w-6 h-6 text-amber-400 inline" /> : `#${idx + 1}`}
            </div>

            <div className="relative">
              <img
                src={`https://ddragon.leagueoflegends.com/cdn/14.20.1/img/profileicon/${item.member.profileIconId || 29}.png`}
                alt="icon"
                className="w-12 h-12 rounded-xl border border-slate-700 object-cover"
              />
              <span className="absolute -bottom-2 -right-1 text-[10px] font-bold bg-slate-800 px-1.5 py-0.5 rounded border border-slate-600 text-slate-300">
                {item.member.role || 'FILL'}
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-base">{item.member.gameName}</span>
                <span className="text-xs text-slate-400">#{item.member.tagLine}</span>
              </div>
              <div className="text-xs font-semibold text-pink-400 italic">"{item.member.nickname}"</div>
            </div>
          </div>

          {/* STATS */}
          <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end">
            {/* RANGO */}
            <div className="text-right">
              {rank ? (
                <>
                  <div className="flex items-center justify-end gap-1.5">
                    <span className={`inline-block px-2.5 py-0.5 text-xs font-bold rounded-md border ${getRankBadgeColor(rank.tier)}`}>
                      {rank.tier} {rank.rank}
                    </span>
                    {queueLabel && (
                      <span className="inline-block px-1.5 py-0.5 text-[9px] font-black rounded-md bg-violet-500/20 text-violet-300 border border-violet-500/40">
                        {queueLabel}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                    {rank.leaguePoints} LP
                  </div>
                </>
              ) : (
                <>
                  <span className="inline-block px-2.5 py-0.5 text-xs font-bold rounded-md border bg-zinc-700/20 text-zinc-400 border-zinc-600/50">
                    UNRANKED
                  </span>
                  <div className="text-[11px] text-slate-500 font-mono mt-0.5">Sin rango</div>
                </>
              )}
            </div>

            {/* WINRATE */}
            <div className="text-right">
              {rank ? (
                <>
                  <div className="text-sm font-bold flex items-center justify-end gap-1">
                    {rank.winrate}%
                    {rank.winrate >= 50 ? (
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {rank.wins}V - {rank.losses}D
                  </div>
                </>
              ) : (
                <div className="text-sm text-slate-500">—</div>
              )}
            </div>

            {/* DELETE */}
            <button
              onClick={() => handleDelete(item.member.id)}
              className="text-slate-500 hover:text-rose-400 transition p-1.5"
              title="Eliminar"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Campeones más jugados */}
        <div className="border-t border-slate-800/60 px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">
            Campeones más jugados
          </div>
          {item.topChampions.length > 0 ? (
            <div className="flex gap-3">
              {item.topChampions.map((c) => (
                <div key={c.championId} className="flex items-center gap-2 bg-slate-800/50 rounded-lg px-2.5 py-1.5">
                  <img
                    src={`https://ddragon.leagueoflegends.com/cdn/14.20.1/img/champion/${c.championName}.png`}
                    alt={c.championName}
                    className="w-7 h-7 rounded-md object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  <div>
                    <div className="text-xs font-semibold text-slate-200">{c.championName}</div>
                    <div className="text-[10px] text-slate-500">
                      Nv.{c.championLevel} · {(c.championPoints / 1000).toFixed(0)}k pts
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-slate-500 italic">
              {item.errors.mastery ? item.errors.mastery.message : 'Sin datos de maestría (quizás no jugó partidas clasificatorias recientes).'}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-black">
      {/* Skip link para accesibilidad */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:bg-slate-800 focus:text-slate-100 focus:px-4 focus:py-2 focus:rounded-lg focus:border focus:border-slate-600"
      >
        Saltar al contenido
      </a>

      {/* HEADER */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-slate-800 rounded-lg border border-slate-700">
              <Swords className="h-6 w-6 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-100">
                {APP_TITLE}
              </h1>
              <p className="text-xs text-slate-400 font-mono hidden sm:inline">{APP_SUBTITLE}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {cacheSize !== null && cacheSize > 0 && (
              <span
                className="hidden md:inline-flex items-center gap-1 text-[10px] font-mono text-slate-500 bg-slate-800/60 border border-slate-700/60 rounded-full px-2 py-1"
                title="Entradas en caché de Riot"
              >
                <Database className="w-3 h-3" />
                {cacheSize} cache
              </span>
            )}
            <button
              onClick={() => fetchData()}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center gap-1.5 text-sm disabled:opacity-50"
              title="Volver a leer los datos desde el caché de la app (rápido). No consulta a Riot de nuevo."
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Actualizar</span>
            </button>
            <button
              onClick={handleForceRefresh}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 transition flex items-center gap-1.5 text-sm disabled:opacity-50"
              title="Limpia TODAS las cachés (incluida la de Riot) y vuelve a pedir todo desde cero. Lento y consume rate limit."
              disabled={forceRefreshing}
            >
              <Zap className={`w-4 h-4 ${forceRefreshing ? 'animate-pulse' : ''}`} />
              <span className="hidden sm:inline">Forzar</span>
            </button>
          </div>
        </div>
      </header>

      {/* API KEY STATUS BAR */}
      <div className="border-b border-slate-800 bg-slate-900/40">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {riotKeyMeta?.configured ? (
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-full border ${
                  riotKeyMeta.isExpired
                    ? 'bg-rose-500/10 text-rose-300 border-rose-500/40 animate-pulse'
                    : riotKeyMeta.remainingHours < 3
                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/40'
                    : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                }`}
                title={
                  riotKeyMeta.expiresAt
                    ? `Vence: ${new Date(riotKeyMeta.expiresAt).toLocaleString('es-AR')}`
                    : ''
                }
              >
                <KeyRound className="w-3.5 h-3.5" />
                {riotKeyMeta.isExpired
                  ? 'API key vencida'
                  : `API key · hace ${riotKeyMeta.ageHours}h`}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-full border bg-rose-500/10 text-rose-300 border-rose-500/40">
                <KeyRound className="w-3.5 h-3.5" />
                Sin API key de Riot
              </span>
            )}
            <button
              onClick={() => {
                setKeyMessage(null);
                setRiotKeyModal(true);
              }}
              className="text-xs font-semibold text-cyan-300 hover:text-cyan-200 transition"
            >
              {riotKeyMeta?.configured ? 'Cambiar' : 'Agregar'} API key
            </button>
          </div>
          <div className="text-[11px] text-slate-500 font-mono hidden md:block">
            Las keys de desarrollo de Riot vencen cada 24h
          </div>
        </div>
      </div>

      {/* NAV TABS */}
      <div className="border-b border-slate-800/80 bg-slate-900/20">
        <div className="max-w-7xl mx-auto px-2 sm:px-4 flex gap-2 sm:gap-6 overflow-x-auto flex-nowrap">
          <button
            onClick={() => setActiveTab('squad')}
            className={`py-2 sm:py-3 text-xs sm:text-sm font-semibold border-b-2 flex items-center gap-1.5 sm:gap-2 transition whitespace-nowrap ${
              activeTab === 'squad'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            Ranking
          </button>
          <button
            onClick={() => setActiveTab('flex')}
            className={`py-2 sm:py-3 text-xs sm:text-sm font-semibold border-b-2 flex items-center gap-1.5 sm:gap-2 transition whitespace-nowrap ${
              activeTab === 'flex'
                ? 'border-violet-500 text-violet-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Gamepad2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            Flex
          </button>
          <button
            onClick={() => setActiveTab('duos')}
            className={`py-2 sm:py-3 text-xs sm:text-sm font-semibold border-b-2 flex items-center gap-1.5 sm:gap-2 transition whitespace-nowrap ${
              activeTab === 'duos'
                ? 'border-pink-500 text-pink-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Flame className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            Sinergia
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`py-2 sm:py-3 text-xs sm:text-sm font-semibold border-b-2 flex items-center gap-1.5 sm:gap-2 transition whitespace-nowrap ${
              activeTab === 'stats'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            Stats
          </button>
          <button
            onClick={() => setActiveTab('weekly')}
            className={`py-2 sm:py-3 text-xs sm:text-sm font-semibold border-b-2 flex items-center gap-1.5 sm:gap-2 transition whitespace-nowrap ${
              activeTab === 'weekly'
                ? 'border-violet-500 text-violet-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            Semanal
          </button>
          <button
            onClick={() => setActiveTab('customs')}
            className={`py-2 sm:py-3 text-xs sm:text-sm font-semibold border-b-2 flex items-center gap-1.5 sm:gap-2 transition whitespace-nowrap ${
              activeTab === 'customs'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Crown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            Customs
          </button>
        </div>
      </div>

      <main id="main-content" className="max-w-7xl mx-auto px-4 py-8 flex-1 w-full space-y-8">
        {/* TAB: SQUAD */}
        {activeTab === 'squad' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-yellow-400" />
                  Tabla de posiciones
                </h2>
                <span className="text-xs bg-slate-800 text-slate-400 px-2.5 py-1 rounded-full border border-slate-700">
                  {stats.length} {stats.length === 1 ? 'miembro' : 'miembros'}
                </span>
              </div>

              {loading && stats.length === 0 ? (
                <div className="space-y-3" aria-busy="true" aria-label="Cargando tabla de posiciones">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4"
                    >
                      <div className="flex items-center gap-4">
                        <Skeleton className="w-5 h-5" />
                        <Skeleton className="w-12 h-12 rounded-xl" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-40" />
                        </div>
                        <div className="flex items-center gap-6">
                          <Skeleton className="h-6 w-24 rounded-md" />
                          <Skeleton className="h-8 w-12" />
                        </div>
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-800/60 flex gap-3">
                        {Array.from({ length: 3 }).map((__, j) => (
                          <div key={j} className="flex items-center gap-2">
                            <Skeleton className="w-7 h-7 rounded-md" />
                            <div className="space-y-1">
                              <Skeleton className="h-2.5 w-16" />
                              <Skeleton className="h-2 w-12" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : stats.length === 0 ? (
                <div className="p-12 text-center text-slate-400 bg-slate-900/40 rounded-xl border border-slate-800">
                  <Users className="w-10 h-10 mx-auto mb-3 text-slate-600" />
                  La squad está vacía. Agregá al primer invocador con el formulario.
                </div>
              ) : (
                <div className="space-y-3">{stats.map(renderMemberCard)}</div>
              )}
            </div>

            {/* FORM: agregar */}
            <div className="space-y-4">
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl sticky top-24">
                <h3 className="text-lg font-bold flex items-center gap-2 mb-2 text-white">
                  <PlusCircle className="w-5 h-5 text-cyan-400" />
                  Meter a alguien a la Squad
                </h3>
                <p className="text-xs text-slate-400 mb-6">
                  Ingresá el Riot ID (Game Name + Tag). Lo verificamos contra la API de Riot: si no existe o la key está vencida, no lo guardamos.
                </p>

                {addError && (
                  <div className="mb-4 bg-rose-500/10 border border-rose-500/40 rounded-lg px-3 py-2.5 flex items-start gap-2 text-rose-300 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{addError}</span>
                  </div>
                )}

                <form onSubmit={handleAddMember} className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <div className="col-span-2 sm:col-span-2">
                      <label className="text-xs font-semibold text-slate-300 block mb-1">Game Name</label>
                      <input
                        type="text"
                        placeholder="ej: bigJoao"
                        value={gameName}
                        onChange={(e) => setGameName(e.target.value)}
                        required
                        className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1">Tag</label>
                      <input
                        type="text"
                        placeholder="LAS"
                        value={tagLine}
                        onChange={(e) => setTagLine(e.target.value)}
                        required
                        className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">
                      Apodo / Cargada interna
                    </label>
                    <input
                      type="text"
                      placeholder="ej: 'El que nunca mira el minimapa'"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Rol Principal</label>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                    >
                      <option value="TOP">Top</option>
                      <option value="JUNGLE">Jungle</option>
                      <option value="MID">Mid</option>
                      <option value="ADC">ADC</option>
                      <option value="SUPPORT">Support</option>
                      <option value="FILL">Fill / Comodín</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2.5 rounded-lg text-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <Spinner size="w-4 h-4" />
                        Verificando...
                      </>
                    ) : (
                      'Agregar a la Squad'
                    )}
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* TAB: DUOS */}
        {activeTab === 'duos' && (
          <div className="space-y-6">
            <SectionHeader
              icon={<Flame className="w-5 h-5 text-pink-500" />}
              title="Sinergia de la Squad"
              description="Con quién les va mejor: dúos, tríos, combos de campeones y patrones de cada jugador. Todo basado en partidas Flex reales."
              badge="FLEX"
            />

            {/* Tendencias por jugador */}
            <TrendsPanel />

            {/* Matriz de tríos */}
            <TrioPanel />

            {/* Recomendador de composición */}
            <CompositionPanel />

            {/* Errores globales del análisis */}
            {duoData && duoData.errors.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/40 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-amber-300 font-semibold text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  {duoData.status === 'error'
                    ? 'No pudimos completar el análisis de sinergias'
                    : 'Análisis parcial: algunos datos no estaban disponibles'}
                </div>
                {duoData.errors.slice(0, 3).map((e, i) => (
                  <div key={i} className="text-xs text-amber-200/80 flex items-start gap-2">
                    <span className="font-mono text-amber-400/70">[{e.type}]</span>
                    <span>{e.message}</span>
                  </div>
                ))}
              </div>
            )}

            {loading && !duoData ? (
              <div className="space-y-4" aria-busy="true" aria-label="Cargando sinergias">
                <div className="space-y-2">
                  <Skeleton className="h-3 w-64" />
                  <Skeleton className="h-2.5 w-80" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="p-5 rounded-2xl border border-slate-800 bg-slate-900/40 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <Skeleton className="h-4 w-20 rounded-md" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                      <div className="space-y-2">
                        <Skeleton className="h-3.5 w-3/4" />
                        <Skeleton className="h-2 w-6 mx-auto" />
                        <Skeleton className="h-3.5 w-3/4" />
                      </div>
                      <div className="border-t border-slate-800/80 pt-3 flex items-center justify-between">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-6 w-14" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : duoData && duoData.duos.length === 0 ? (
              <div className="p-12 text-center text-slate-400 bg-slate-900/40 rounded-xl border border-slate-800">
                <ShieldAlert className="w-10 h-10 mx-auto mb-3 text-slate-600" />
                {duoData.status === 'error'
                  ? 'No se pudo analizar sinergias. Revisá los errores arriba.'
                  : 'No se encontraron partidas recientes donde hayan jugado 2+ miembros de la squad juntos.'}
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <div className="text-xs text-slate-500 font-mono">
                    {duoData?.scannedMatches} partidas compartidas analizadas · {duoData?.membersAnalyzed} miembros
                  </div>
                  <div className="text-[11px] text-slate-600">
                    Solo dúos con 2+ partidas juntos · últimas 20 partidas Flex de cada jugador
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {duoData?.duos.map((d, index) => {
                    const syn = synergyVisual(d.synergyRating);

                    return (
                      <div
                        key={index}
                        className={`p-5 rounded-2xl border transition relative overflow-hidden bg-slate-900/40 ${syn.border}`}
                      >
                        <div className="flex items-center justify-between mb-4">
                          <span
                            className={`text-xs font-black uppercase px-2 py-0.5 rounded-md border ${syn.badge}`}
                          >
                            {syn.label}
                          </span>
                          <span className="text-xs text-slate-400 font-mono">{d.totalGames} juntos</span>
                        </div>

                        <div className="space-y-1 mb-4">
                          <div className="text-sm font-semibold text-slate-200">{d.player1Name}</div>
                          <div className="text-xs text-slate-500 font-mono text-center">+</div>
                          <div className="text-sm font-semibold text-slate-200">{d.player2Name}</div>
                        </div>

                        <div className="border-t border-slate-800/80 pt-3 flex items-center justify-between">
                          <span className="text-xs text-slate-400">Winrate Duo:</span>
                          <div className="text-xl font-black">
                            <span className={syn.number}>
                              {d.winrate}%
                            </span>
                          </div>
                        </div>

                        <div className="text-[11px] text-slate-500 mt-1 flex justify-between items-center">
                          <span className="text-emerald-400/80">{d.wins} ganadas</span>
                          <span className="text-slate-600 font-mono text-[10px]">
                            {d.wins}V{d.losses}D de {d.totalGames}
                          </span>
                          <span className="text-rose-400/80">{d.losses} perdidas</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB: FLEX */}
        {activeTab === 'flex' && (
          <FlexTab
            refreshKey={flexRefreshKey}
            playerMetrics={playerMetrics}
            metricsLoading={metricsLoading}
            metricsError={metricsError}
            loadMetrics={loadMetrics}
          />
        )}

        {/* TAB: STATS / GRÁFICOS */}
        {activeTab === 'stats' && (
          <div className="space-y-6">
            <SectionHeader
              icon={<BarChart3 className="w-5 h-5 text-amber-400" />}
              title="Estadísticas y Premios"
              description="Premios automáticos, promedios por jugador y el tilt meter (cómo les afecta perder)."
            />

            <StatsTab
              members={stats.map((s) => ({
                id: s.member.id,
                gameName: s.member.gameName,
                nickname: s.member.nickname,
                profileIconId: s.member.profileIconId || 29,
              }))}
              metrics={playerMetrics}
              metricsLoading={metricsLoading}
            />
          </div>
        )}

        {/* TAB: SEMANAL */}
        {activeTab === 'weekly' && (
          <div className="space-y-6">
            <SectionHeader
              icon={<CalendarDays className="w-5 h-5 text-violet-400" />}
              title="Resumen Semanal con IA"
              description="Análisis automático de las últimas semanas: récords, tendencias y 3 cosas para mejorar por jugador."
            />

            <WeeklyTab
              members={stats.map((s) => ({
                id: s.member.id,
                gameName: s.member.gameName,
                nickname: s.member.nickname,
                profileIconId: s.member.profileIconId || 29,
              }))}
            />
          </div>
        )}

        {/* TAB: CUSTOMS */}
        {activeTab === 'customs' && (
          <CustomsTab
            members={stats}
            customs={customs}
            onChanged={fetchData}
            memberById={memberById}
          />
        )}
      </main>

      {/* MODAL: API Key de Riot */}
      {riotKeyModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setRiotKeyModal(false)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-cyan-400" />
                API Key de Riot
              </h3>
              <button
                onClick={() => setRiotKeyModal(false)}
                className="text-slate-500 hover:text-slate-300"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <ol className="text-xs text-slate-300 space-y-2 mb-4 list-decimal list-inside">
              <li>
                Entrá a{' '}
                <a
                  href="https://developer.riotgames.com"
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-400 underline"
                >
                  developer.riotgames.com
                </a>{' '}
                e iniciá sesión.
              </li>
              <li>
                En la sección <b>"API Key (Development)"</b> hacé clic en{' '}
                <b>Generate</b> (o copiá la key existente).
              </li>
              <li>
                Pegá la key abajo y hacé clic en <b>Verificar y guardar</b>.
              </li>
              <li className="text-slate-500">
                La key de desarrollo vence cada 24h: cuando el badge se ponga
                rojo, repetí el paso 2.
              </li>
            </ol>

            {keyMessage && (
              <div
                className={`mb-4 rounded-lg px-3 py-2 text-xs flex items-start gap-2 ${
                  keyMessage.ok
                    ? 'bg-emerald-500/10 border border-emerald-500/40 text-emerald-300'
                    : 'bg-rose-500/10 border border-rose-500/40 text-rose-300'
                }`}
              >
                {keyMessage.ok ? (
                  <CircleCheck className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{keyMessage.text}</span>
              </div>
            )}

            <form onSubmit={handleSaveRiotKey} className="space-y-3">
              <input
                type="text"
                value={newKeyInput}
                onChange={(e) => setNewKeyInput(e.target.value)}
                placeholder="RGAPI-...."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
              />
              <button
                type="submit"
                disabled={keyVerifying || !newKeyInput.trim()}
                className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg text-sm transition"
              >
                {keyVerifying ? 'Verificando con Riot...' : 'Verificar y guardar'}
              </button>
            </form>
          </div>
        </div>
      )}

      <footer className="border-t border-slate-800/60 py-6 text-center text-xs text-slate-600">
        {APP_TITLE}
      </footer>
    </div>
  );
}
