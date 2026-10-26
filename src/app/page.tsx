'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
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
import { APP_TITLE, APP_SUBTITLE, APP_REPO_URL, SHOW_RIOT_KEY_UI } from '@/lib/config';
import { clearAllFetchCache } from '@/hooks/useCachedFetch';
import { Skeleton } from '@/components/Skeleton';
import SectionHeader from '@/components/SectionHeader';
import SquadTab from '@/components/SquadTab';
import RiotKeyManager from '@/components/RiotKeyManager';
import ShareButton from '@/components/ShareButton';
import FreshnessBadge from '@/components/FreshnessBadge';

type TabId = 'squad' | 'duos' | 'flex' | 'stats' | 'weekly' | 'customs';

/** Placeholder mientras entra el chunk de una pestaña. */
function TabSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3"
        >
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-64" />
        </div>
      ))}
    </div>
  );
}

/**
 * Las pestañas se cargan bajo demanda.
 *
 * Todas iban en el bundle inicial aunque solo se muestra una a la vez, y cada una
 * arrastra lo suyo (FlexTab se lleva CoachIA, LaneDiffPanel y las tarjetas de
 * partida). Con `next/dynamic` el primer render solo descarga Ranking, que es la
 * pestaña de arranque.
 */
const FlexTab = dynamic(() => import('@/components/FlexTab'), { loading: TabSkeleton });
const DuosTab = dynamic(() => import('@/components/DuosTab'), { loading: TabSkeleton });
const StatsTab = dynamic(() => import('@/components/StatsTab'), { loading: TabSkeleton });
const WeeklyTab = dynamic(() => import('@/components/WeeklyTab'), { loading: TabSkeleton });
const CustomsTab = dynamic(() => import('@/components/CustomsTab'), { loading: TabSkeleton });

const TABS: { id: TabId; label: string; Icon: typeof Trophy; active: string }[] = [
  { id: 'squad', label: 'Ranking', Icon: Trophy, active: 'border-cyan-500 text-cyan-400' },
  { id: 'flex', label: 'Flex', Icon: Gamepad2, active: 'border-violet-500 text-violet-400' },
  { id: 'duos', label: 'Sinergia', Icon: Flame, active: 'border-pink-500 text-pink-400' },
  { id: 'stats', label: 'Stats', Icon: BarChart3, active: 'border-amber-500 text-amber-400' },
  { id: 'weekly', label: 'Semanal', Icon: CalendarDays, active: 'border-violet-500 text-violet-400' },
  { id: 'customs', label: 'Customs', Icon: Crown, active: 'border-indigo-500 text-indigo-400' },
];

export default function Home() {
  const [stats, setStats] = useState<MemberResult[]>([]);
  const [duoData, setDuoData] = useState<DuoResult | null>(null);
  const [customs, setCustoms] = useState<{
    matches: CustomMatch[];
    table: Record<string, TableRow>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('squad');
  const [cacheSize, setCacheSize] = useState<number | null>(null);
  const [forceRefreshing, setForceRefreshing] = useState(false);
  // Cuando cambia, FlexTab recarga partidas, métricas e historial de chat.
  const [flexRefreshKey, setFlexRefreshKey] = useState(0);

  // Métricas agregadas por jugador. Las usan dos pestañas (Flex y Estadísticas),
  // por eso viven en la página y no en FlexTab.
  const [playerMetrics, setPlayerMetrics] = useState<PlayerMetrics[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  // Para abortar los fetches en vuelo si se dispara otro pedido antes de que
  // termine el anterior (el botón "Actualizar" rápido, o el force refresh).
  const dataAbort = useRef<AbortController | null>(null);
  const metricsAbort = useRef<AbortController | null>(null);

  // Cuándo se cargó el último dato. Sirve para el badge de frescura del header:
  // las cifras de esta app salen de la API de Riot y muchos usuarios asumen que
  // están en vivo, así que conviene decirles de cuándo son.
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);

  const loadMetrics = useCallback(async () => {
    metricsAbort.current?.abort();
    const ctrl = new AbortController();
    metricsAbort.current = ctrl;

    try {
      setMetricsLoading(true);
      setMetricsError(null);
      const res = await fetch('/api/player-metrics', { signal: ctrl.signal }).then((r) =>
        r.json()
      );
      if (res.status === 'error') {
        setMetricsError(
          res.errors?.[0]?.message || 'No se pudieron calcular métricas.'
        );
        setPlayerMetrics([]);
      } else {
        setPlayerMetrics(res.metrics || []);
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      setMetricsError('Error de red al cargar métricas.');
    } finally {
      if (!ctrl.signal.aborted) setMetricsLoading(false);
    }
  }, []);

  const fetchData = useCallback(async () => {
    dataAbort.current?.abort();
    const ctrl = new AbortController();
    dataAbort.current = ctrl;

    try {
      setLoading(true);
      const [resStats, resDuos, resCustoms, resCache] = await Promise.all([
        fetch('/api/stats', { signal: ctrl.signal }).then((r) => r.json()),
        fetch('/api/duos', { signal: ctrl.signal }).then((r) => r.json()),
        fetch('/api/customs', { signal: ctrl.signal }).then((r) => r.json()),
        fetch('/api/cache', { signal: ctrl.signal })
          .then((r) => r.json())
          .catch(() => null),
      ]);
      setStats(resStats);
      setDuoData(resDuos);
      setCustoms(resCustoms);
      setCacheSize(resCache?.cachedEntries ?? null);
      setFetchedAt(Date.now());
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      console.error(err);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    loadMetrics();
    return () => {
      dataAbort.current?.abort();
      metricsAbort.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cuando RiotKeyManager guarda una key nueva hay que recargar todo.
  const handleRiotKeyChanged = useCallback(async () => {
    await fetchData();
    await loadMetrics();
    setFlexRefreshKey((k) => k + 1);
  }, [fetchData, loadMetrics]);

  const handleForceRefresh = useCallback(async () => {
    try {
      setForceRefreshing(true);
      // Limpiamos la caché de fetch del cliente para forzar todo
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
  }, [fetchData, loadMetrics]);

  // Props derivados. Sin esto se creaban arrays y objetos nuevos en cada render
  // de la página (que tiene 9 useState), y StatsTab/WeeklyTab re-renderizaban
  // enteros aunque sus datos no hubieran cambiado.
  const memberById = useCallback(
    (id: string) => stats.find((s) => s.member.id === id),
    [stats]
  );

  const slimMembers = useMemo(
    () =>
      stats.map((s) => ({
        id: s.member.id,
        gameName: s.member.gameName,
        nickname: s.member.nickname,
        profileIconId: s.member.profileIconId || 29,
        role: s.member.role,
      })),
    [stats]
  );

  const weeklyMembers = useMemo(
    () =>
      stats.map((s) => ({
        id: s.member.id,
        gameName: s.member.gameName,
        nickname: s.member.nickname,
        profileIconId: s.member.profileIconId || 29,
      })),
    [stats]
  );

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
            <FreshnessBadge fetchedAt={fetchedAt} />
            {cacheSize !== null && cacheSize > 0 && (
              <span
                className="hidden md:inline-flex items-center gap-1 text-[10px] font-mono text-slate-400 bg-slate-800/60 border border-slate-700/60 rounded-full px-2 py-1"
                title="Entradas en caché de Riot"
              >
                <Database className="w-3 h-3" aria-hidden="true" />
                {cacheSize} cache
              </span>
            )}
            <button
              onClick={() => fetchData()}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center gap-1.5 text-sm disabled:opacity-50"
              title="Volver a leer los datos desde el caché de la app (rápido). No consulta a Riot de nuevo."
              aria-label="Actualizar datos"
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span className="hidden sm:inline">Actualizar</span>
            </button>
            <button
              onClick={handleForceRefresh}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 transition flex items-center gap-1.5 text-sm disabled:opacity-50"
              title="Limpia las cachés en memoria y vuelve a pedir todo a Riot. Lento y consume rate limit. Las partidas ya guardadas en Supabase se siguen reusando."
              aria-label="Forzar recarga desde Riot"
              disabled={forceRefreshing}
            >
              <Zap className={`w-4 h-4 ${forceRefreshing ? 'animate-pulse' : ''}`} aria-hidden="true" />
              <span className="hidden sm:inline">Forzar</span>
            </button>
            <ShareButton />
          </div>
        </div>
      </header>

      {/* ────────────────────────────────────────────────────────────────
          API KEY STATUS BAR — OCULTA POR DEFECTO (no eliminada)

          Si estás leyendo esto y no ves la barra "Cambiar API key" más abajo,
          es intencional: no es un código muerto ni un import olvidado.

          El motivo es que este repo apunta a dos situaciones distintas:

            a) Deployment con la key puesta como variable de entorno en Vercel
               (o en .env.local). Ahí la barra es ruido: ya está configurada,
               y encima RiotKeyManager sondea /api/riot-key cada 60 segundos
               para nada.
            b) Deployment sin key en el entorno, donde querés cargarla o
               renovarla desde la interfaz sin redeployar (las keys de
               desarrollo de Riot vencen cada 24h).

          Arranca en (a). Para pasar a (b) alcanza con definir
          NEXT_PUBLIC_SHOW_RIOT_KEY_UI=true en el entorno y redeployar,
          porque las NEXT_PUBLIC_ se inlinean en tiempo de build. Detalle en
          SHOW_RIOT_KEY_UI (src/lib/config.ts).

          Nada de esto toca el componente: RiotKeyManager.tsx y el endpoint
          /api/riot-key siguen intactos y funcionando.
          ──────────────────────────────────────────────────────────────── */}
      {SHOW_RIOT_KEY_UI && (
        <RiotKeyManager onKeyChanged={handleRiotKeyChanged} />
      )}

      {/* NAV TABS
          role="tablist" + aria: antes eran 6 <button> sueltos y un lector de
          pantalla los anunciaba como "button, button, button..." sin contexto y
          sin relación con el panel que controlan. */}
      <div className="border-b border-slate-800/80 bg-slate-900/20">
        <div
          role="tablist"
          aria-label="Secciones de la app"
          className="max-w-7xl mx-auto px-2 sm:px-4 flex gap-2 sm:gap-6 overflow-x-auto flex-nowrap"
        >
          {TABS.map(({ id, label, Icon, active }) => {
            const selected = activeTab === id;
            return (
              <button
                key={id}
                role="tab"
                id={`tab-${id}`}
                aria-selected={selected}
                aria-controls="main-content"
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveTab(id)}
                onKeyDown={(e) => {
                  // Flechas para moverse entre pestañas, patrón estándar de
                  // tablist: sin esto solo se llega con Tab y Enter.
                  const i = TABS.findIndex((t) => t.id === activeTab);
                  if (e.key === 'ArrowRight') {
                    setActiveTab(TABS[(i + 1) % TABS.length].id);
                  } else if (e.key === 'ArrowLeft') {
                    setActiveTab(TABS[(i - 1 + TABS.length) % TABS.length].id);
                  } else if (e.key === 'Home') {
                    setActiveTab(TABS[0].id);
                  } else if (e.key === 'End') {
                    setActiveTab(TABS[TABS.length - 1].id);
                  } else {
                    return;
                  }
                  e.preventDefault();
                }}
                className={`py-2 sm:py-3 text-xs sm:text-sm font-semibold border-b-2 flex items-center gap-1.5 sm:gap-2 transition whitespace-nowrap ${
                  selected ? active : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Todas las pestañas controlan este mismo panel: solo hay una en el DOM
          a la vez y lo que cambia es su contenido. `aria-labelledby` apunta al
          tab activo para que se anuncie el nombre correcto. */}
      <main
        id="main-content"
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
        tabIndex={-1}
        className="max-w-7xl mx-auto px-4 py-8 flex-1 w-full space-y-8"
      >
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
              members={slimMembers}
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

            <WeeklyTab members={weeklyMembers} />
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

      <footer className="border-t border-slate-800/60 py-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>{APP_TITLE}</span>
          <div className="flex items-center gap-4">
            <a
              href={APP_REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-slate-400 transition"
              title="Ver el código en GitHub"
            >
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
              </svg>
              Código fuente
            </a>
            <span className="text-slate-700" aria-hidden="true">
              ·
            </span>
            <a
              href="https://developer.riotgames.com"
              target="_blank"
              rel="noreferrer"
              className="hover:text-slate-400 transition"
              title="Riot Games Developer Portal"
            >
              Datos de Riot
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
