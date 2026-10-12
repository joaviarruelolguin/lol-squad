'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Gamepad2,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { FlexMatch, PlayerMetrics } from '@/lib/types';
import type { ErrorInfo } from '@/lib/errors';
import CoachIA from './CoachIA';
import PlayerMetricsCard from './PlayerMetricsCard';
import FlexMatchCard from './FlexMatchCard';
import SectionHeader from './SectionHeader';
import Spinner from './Spinner';
import { Skeleton } from './Skeleton';

type ChatMessage = { role: 'user' | 'assistant'; content: string };
type HistoryWithId = ChatMessage[] & { _chatId?: string };

const FLEX_PAGE_SIZE = 5;

/**
 * Análisis de partidas Flex: chat con la IA, métricas agregadas por jugador,
 * listado paginado de partidas y puntos débiles.
 *
 * Esta pestaña es dueña del estado del chat con la IA y de la paginación de
 * partidas. Las métricas viven en la página porque la pestaña de Estadísticas
 * también las usa.
 *
 * La página le avisa que hay que recargar vía `refreshKey` (se incrementa al
 * forzar refresco o al guardar una API key nueva).
 */
export default function FlexTab({
  refreshKey,
  playerMetrics,
  metricsLoading,
  metricsError,
  loadMetrics,
}: {
  refreshKey: number;
  playerMetrics: PlayerMetrics[];
  metricsLoading: boolean;
  metricsError: string | null;
  loadMetrics: () => Promise<void>;
}) {
  // ---- Partidas Flex (paginadas de a 5) ----
  const [flexMatches, setFlexMatches] = useState<FlexMatch[]>([]);
  const [flexErrors, setFlexErrors] = useState<ErrorInfo[]>([]);
  const [flexStatus, setFlexStatus] = useState<
    'ok' | 'partial' | 'error' | 'idle'
  >('idle');
  const [flexOffset, setFlexOffset] = useState(0);
  const [flexHasMore, setFlexHasMore] = useState(false);
  const [flexLoading, setFlexLoading] = useState(false);

  // ---- Chat con la IA ----
  const [aiMatchId, setAiMatchId] = useState('');
  const [aiMessage, setAiMessage] = useState('');
  const [aiHistory, setAiHistory] = useState<HistoryWithId>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiModel, setAiModel] = useState('');
  const [chatExpanded, setChatExpanded] = useState(true);
  const [matchPickerOpen, setMatchPickerOpen] = useState(false);
  const [chatHistoryOpen, setChatHistoryOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<any[]>([]);

  const loadFlex = useCallback(async (offset: number, append: boolean) => {
    try {
      setFlexLoading(true);
      const res = await fetch(
        `/api/flex-matches?offset=${offset}&limit=${FLEX_PAGE_SIZE}`
      ).then((r) => r.json());
      const incoming: FlexMatch[] = res?.matches || [];
      setFlexMatches((prev) => (append ? [...prev, ...incoming] : incoming));
      setFlexErrors(res?.errors || []);
      setFlexStatus(res?.status || 'error');
      setFlexOffset(offset);
      setFlexHasMore(Boolean(res?.pagination?.hasMore));
    } catch (err) {
      console.error(err);
      setFlexStatus('error');
    } finally {
      setFlexLoading(false);
    }
  }, []);

  const loadChatHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/chats').then((r) => r.json());
      setChatHistory(res.chats || []);
    } catch {
      // silencioso: el historial es opcional
    }
  }, []);

  // Las métricas las carga la página (las comparte con la pestaña de Stats).
  useEffect(() => {
    loadFlex(0, false);
    loadChatHistory();
  }, [loadFlex, loadChatHistory, refreshKey]);

  const handleLoadMoreFlex = () => {
    // Guardamos la posición del scroll para restaurarla después de cargar,
    // porque al re-renderizar el contenido el navegador sube al tope.
    const scrollBefore = typeof window !== 'undefined' ? window.scrollY : 0;
    loadFlex(flexOffset + FLEX_PAGE_SIZE, true).then(() => {
      if (typeof window !== 'undefined') {
        // requestAnimationFrame espera a que el DOM pinte las partidas nuevas
        requestAnimationFrame(() => {
          window.scrollTo({ top: scrollBefore, behavior: 'smooth' });
        });
      }
    });
  };

  const handleAiChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiMatchId || !aiMessage.trim()) return;
    try {
      setAiLoading(true);
      setAiError(null);
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId: aiMatchId,
          message: aiMessage,
          history: aiHistory,
          chatId: aiHistory._chatId || undefined,
          model: aiModel || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiError(data.error || 'La IA no pudo responder');
        return;
      }
      const newHistory = [
        ...aiHistory,
        { role: 'user' as const, content: aiMessage },
        { role: 'assistant' as const, content: data.reply },
      ] as HistoryWithId;
      newHistory._chatId = data.chatId;
      setAiHistory(newHistory);
      setAiMessage('');
      loadChatHistory();
    } catch {
      setAiError('Error de red al contactar la IA');
    } finally {
      setAiLoading(false);
    }
  };

  const handleNewChat = () => {
    setAiHistory([]);
    setAiMessage('');
    setAiError(null);
    setAiMatchId('');
    setChatHistoryOpen(false);
  };

  const handleLoadChat = (messages: ChatMessage[], matchId: string) => {
    setAiHistory([...messages] as HistoryWithId);
    setAiMatchId(matchId);
    setAiMessage('');
    setAiError(null);
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<Gamepad2 className="w-5 h-5 text-violet-400" />}
        title="Análisis de Partidas Flex"
        description="Últimas flexibles (Ranked Flex) de la squad: equipos, campeones, daño, KDA y puntos débiles."
      />

      {/* COACH IA — inicio de Análisis de Flex */}
      <CoachIA
        flexMatches={flexMatches}
        aiMatchId={aiMatchId}
        setAiMatchId={setAiMatchId}
        aiMessage={aiMessage}
        setAiMessage={setAiMessage}
        aiHistory={aiHistory}
        aiLoading={aiLoading}
        aiError={aiError}
        chatExpanded={chatExpanded}
        setChatExpanded={setChatExpanded}
        matchPickerOpen={matchPickerOpen}
        setMatchPickerOpen={setMatchPickerOpen}
        chatHistory={chatHistory}
        chatHistoryOpen={chatHistoryOpen}
        setChatHistoryOpen={setChatHistoryOpen}
        handleAiChat={handleAiChat}
        handleNewChat={handleNewChat}
        loadChatHistory={loadChatHistory}
        onLoadChat={handleLoadChat}
        selectedModel={aiModel}
        onModelChange={setAiModel}
      />

      {/* MÉTRICAS AGREGADAS POR JUGADOR */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold flex items-center gap-2 text-white">
            <TrendingUp className="w-5 h-5 text-cyan-400" />
            Métricas por Jugador
          </h3>
          <button
            onClick={loadMetrics}
            disabled={metricsLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium transition disabled:opacity-50"
          >
            {metricsLoading ? (
              <Spinner size="w-3.5 h-3.5" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">Actualizar</span>
          </button>
        </div>

        {metricsLoading && playerMetrics.length === 0 ? (
          <div
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
            aria-busy="true"
            aria-label="Calculando métricas"
          >
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 space-y-3"
              >
                <div className="flex items-center gap-3">
                  <Skeleton className="w-10 h-10 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-2.5 w-20" />
                  </div>
                  <Skeleton className="h-9 w-14" />
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {Array.from({ length: 4 }).map((__, j) => (
                    <div key={j} className="space-y-1">
                      <Skeleton className="h-3.5 w-full" />
                      <Skeleton className="h-2 w-8 mx-auto" />
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 bg-slate-900/50 rounded-lg px-2.5 py-1.5">
                  <Skeleton className="w-6 h-6 rounded" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-2 w-20" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : metricsError ? (
          <div className="bg-rose-500/10 border border-rose-500/40 rounded-lg px-3 py-2 text-rose-300 text-xs flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{metricsError}</span>
          </div>
        ) : playerMetrics.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            No hay métricas disponibles todavía.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {playerMetrics.map((m, idx) => (
              <PlayerMetricsCard key={m.memberId} metric={m} idx={idx} />
            ))}
          </div>
        )}
      </div>

      {/* Errores */}
      {flexErrors.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/40 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-300 font-semibold text-sm">
            <AlertTriangle className="w-4 h-4" />
            {flexStatus === 'error'
              ? 'No pudimos completar el análisis Flex'
              : 'Análisis parcial: algunos datos no estaban disponibles'}
          </div>
          {flexErrors.slice(0, 3).map((e, i) => (
            <div key={i} className="text-xs text-amber-200/80 flex items-start gap-2">
              <span className="font-mono text-amber-400/70">[{e.type}]</span>
              <span>{e.message}</span>
            </div>
          ))}
        </div>
      )}

      {flexStatus === 'idle' || (flexLoading && flexMatches.length === 0) ? (
        <div
          className="space-y-6"
          aria-busy="true"
          aria-label="Buscando partidas Flex"
        >
          {Array.from({ length: 2 }).map((_, mi) => (
            <div
              key={mi}
              className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-4 w-4 rounded-full" />
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <div className="flex gap-1.5">
                  {Array.from({ length: 3 }).map((__, bi) => (
                    <Skeleton key={bi} className="h-4 w-14 rounded-full" />
                  ))}
                </div>
              </div>
              <div className="px-4 py-2 border-b border-slate-800/60 flex gap-1.5">
                {Array.from({ length: 3 }).map((__, si) => (
                  <Skeleton key={si} className="h-5 w-28 rounded-full" />
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4">
                {[0, 1].map((ti) => (
                  <div
                    key={ti}
                    className="rounded-xl border border-slate-800 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-4 w-14 rounded" />
                      </div>
                      <Skeleton className="h-3 w-16" />
                    </div>
                    {Array.from({ length: 5 }).map((__, pi) => (
                      <div key={pi} className="flex items-center gap-2">
                        <Skeleton className="w-7 h-7 rounded-md shrink-0" />
                        <Skeleton className="h-3 flex-1" />
                        <Skeleton className="h-3 w-12 shrink-0" />
                        <Skeleton className="h-2 w-14 shrink-0" />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : flexMatches.length === 0 ? (
        <div className="p-12 text-center text-slate-400 bg-slate-900/40 rounded-xl border border-slate-800">
          <Gamepad2 className="w-10 h-10 mx-auto mb-3 text-slate-500" />
          {flexStatus === 'error'
            ? 'No se pudo analizar Flex. Revisá los errores arriba.'
            : 'No se encontraron partidas Flex recientes de los miembros de la squad.'}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-500 font-mono">
              Mostrando {flexMatches.length} partidas (de a {FLEX_PAGE_SIZE})
            </div>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-violet-500/20 text-violet-300 border border-violet-500/40">
              FLEX
            </span>
          </div>
          <div className="space-y-6">
            {flexMatches.map((match) => (
              <FlexMatchCard key={match.matchId} match={match} />
            ))}
          </div>

          {/* Paginación */}
          <div className="flex justify-center pt-2">
            {flexHasMore ? (
              <button
                onClick={handleLoadMoreFlex}
                disabled={flexLoading}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 font-semibold text-sm px-6 py-2.5 rounded-xl border border-slate-700 transition"
              >
                {flexLoading ? (
                  <Spinner size="w-4 h-4" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                {flexLoading ? 'Cargando...' : 'Cargar 5 más'}
              </button>
            ) : (
              <div className="text-xs text-slate-500 font-mono">
                Fin del historial Flex analizado
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
