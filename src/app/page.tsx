'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Trophy,
  Flame,
  Swords,
  Crown,
  RefreshCw,
  Zap,
  Database,
  Gamepad2,
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
import WeeklyTab from '@/components/WeeklyTab';
import SectionHeader from '@/components/SectionHeader';
import FlexTab from '@/components/FlexTab';
import SquadTab from '@/components/SquadTab';
import DuosTab from '@/components/DuosTab';
import CustomsTab from '@/components/CustomsTab';
import RiotKeyManager from '@/components/RiotKeyManager';

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

  // Cuando RiotKeyManager guarda una key nueva hay que recargar todo.
  const handleRiotKeyChanged = async () => {
    await fetchData();
    await loadMetrics();
    setFlexRefreshKey((k) => k + 1);
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

  const memberById = (id: string) => stats.find((s) => s.member.id === id);

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
      <RiotKeyManager onKeyChanged={handleRiotKeyChanged} />

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
          <SquadTab stats={stats} loading={loading} onChanged={fetchData} />
        )}

        {/* TAB: DUOS */}
        {activeTab === 'duos' && (
          <DuosTab duoData={duoData} loading={loading} />
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

      <footer className="border-t border-slate-800/60 py-6 text-center text-xs text-slate-600">
        {APP_TITLE}
      </footer>
    </div>
  );
}
