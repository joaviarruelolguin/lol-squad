'use client';

import React, { useState, useEffect } from 'react';
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
  CheckCircle2,
  Users,
  ShieldAlert,
  Medal,
  Plus,
  X,
  Zap,
  Database,
  Gamepad2,
  Skull,
  Eye,
  Crosshair,
  Scale,
  Clock,
  Calendar,
  Bot,
  KeyRound,
  XCircle,
  CircleCheck,
  BarChart3,
  CalendarDays,
} from 'lucide-react';
import {
  MemberResult,
  DuoResult,
  DuoStat,
  SquadMember,
  CustomMatch,
  TableRow,
  FlexMatch,
  FlexPlayer,
  WeakPoint,
  PlayerMetrics,
  PlayerMetricsResult,
} from '@/lib/types';
import type { ErrorInfo } from '@/lib/errors';
import { APP_TITLE, APP_SUBTITLE } from '@/lib/config';
import { clearAllFetchCache } from '@/hooks/useCachedFetch';
import CoachIA from '@/components/CoachIA';
import PlayerMetricsCard from '@/components/PlayerMetricsCard';
import StatsTab from '@/components/StatsTab';
import CompositionPanel from '@/components/CompositionPanel';
import TrioPanel from '@/components/TrioPanel';
import TrendsPanel from '@/components/TrendsPanel';
import WeeklyTab from '@/components/WeeklyTab';

// Indicador de frescura de datos
function FreshnessBadge({ fetchedAt, ttl }: { fetchedAt: number | null; ttl?: number }) {
  if (!fetchedAt) return null;
  const minutes = Math.floor((Date.now() - fetchedAt) / 60000);
  const stale = minutes > 15;

  return (
    <span
      className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
        minutes < 2
          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
          : stale
          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
          : 'bg-slate-800/60 text-slate-500 border-slate-700/60'
      }`}
      title={
        minutes === 0
          ? 'Datos recién cargados'
          : `Datos de hace ${minutes} minuto${minutes === 1 ? '' : 's'}`
      }
    >
      {minutes === 0 ? 'recién actualizado' : `hace ${minutes}m`}
    </span>
  );
}

// Encabezado de sección (título + descrição + badge opcional)
function SectionHeader({
  icon,
  title,
  description,
  badge,
  color = 'text-slate-100',
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  badge?: string;
  color?: string;
}) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2.5 flex-wrap">
        <h2 className={`text-xl font-bold flex items-center gap-2 ${color}`}>
          {icon}
          {title}
        </h2>
        {badge && (
          <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-violet-500/20 text-violet-300 border border-violet-500/40">
            {badge}
          </span>
        )}
      </div>
      {description && (
        <p className="text-sm text-slate-400 mt-1 max-w-3xl">{description}</p>
      )}
    </div>
  );
}

// Spinner reutilizable
const Spinner = ({ size = 'w-5 h-5', className = '' }: { size?: string; className?: string }) => (
  <svg className={`animate-spin ${size} ${className}`} viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

export default function Home() {
  const [stats, setStats] = useState<MemberResult[]>([]);
  const [duoData, setDuoData] = useState<DuoResult | null>(null);
  const [customs, setCustoms] = useState<{
    matches: CustomMatch[];
    table: Record<string, TableRow>;
  } | null>(null);
  // Estado paginado del análisis Flex
  const [flexMatches, setFlexMatches] = useState<FlexMatch[]>([]);
  const [flexErrors, setFlexErrors] = useState<ErrorInfo[]>([]);
  const [flexStatus, setFlexStatus] = useState<
    'ok' | 'partial' | 'error' | 'idle'
  >('idle');
  const [flexOffset, setFlexOffset] = useState(0);
  const [flexLimit] = useState(5);
  const [flexHasMore, setFlexHasMore] = useState(false);
  const [flexLoading, setFlexLoading] = useState(false);
  // Chat con la IA
  const [aiMatchId, setAiMatchId] = useState('');
  const [aiMessage, setAiMessage] = useState('');
  const [aiHistory, setAiHistory] = useState<
    { role: 'user' | 'assistant'; content: string }[]
  >([]);
  const [aiReply, setAiReply] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [chatExpanded, setChatExpanded] = useState(true);
  const [matchPickerOpen, setMatchPickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'squad' | 'duos' | 'flex' | 'stats' | 'weekly' | 'customs'>('squad');
  const [cacheSize, setCacheSize] = useState<number | null>(null);
  const [forceRefreshing, setForceRefreshing] = useState(false);

  // Métricas agregadas por jugador (Flex)
  const [playerMetrics, setPlayerMetrics] = useState<PlayerMetrics[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  // Historial de chats (Supabase)
  const [chatHistory, setChatHistory] = useState<
    { id: string; title: string; matchId: string; messageCount: number; updatedAt: string }[]
  >([]);
  const [chatHistoryOpen, setChatHistoryOpen] = useState(false);
  const [aiModel, setAiModel] = useState(''); // '' = automático con fallback

  // Form states
  const [gameName, setGameName] = useState('');
  const [tagLine, setTagLine] = useState('');
  const [nickname, setNickname] = useState('');
  const [role, setRole] = useState<'TOP' | 'JUNGLE' | 'MID' | 'ADC' | 'SUPPORT' | 'FILL'>('FILL');
  const [submitting, setSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Customs form
  const [cTeamAName, setCTeamAName] = useState('');
  const [cTeamBName, setCTeamBName] = useState('');
  const [cTeamA, setCTeamA] = useState<string[]>([]);
  const [cTeamB, setCTeamB] = useState<string[]>([]);
  const [cScoreA, setCScoreA] = useState('');
  const [cScoreB, setCScoreB] = useState('');
  const [cWinner, setCWinner] = useState<'A' | 'B' | ''>('');
  const [cMvp, setCMvp] = useState('');
  const [cError, setCError] = useState<string | null>(null);

  // Balanceo automático de equipos
  const [cPresent, setCPresent] = useState<string[]>([]);
  const [balancing, setBalancing] = useState(false);
  const [balanceInfo, setBalanceInfo] = useState<{
    avgA: number; avgB: number; diff: number; fair: boolean;
  } | null>(null);

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
    loadFlex(0, false);
    loadMetrics();
    loadChatHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Carga paginada del análisis Flex (de a `flexLimit` partidas)
  const loadFlex = async (offset: number, append: boolean) => {
    try {
      setFlexLoading(true);
      const res = await fetch(
        `/api/flex-matches?offset=${offset}&limit=${flexLimit}`
      ).then((r) => r.json());
      const incoming: FlexMatch[] = res?.matches || [];
      setFlexMatches((prev) =>
        append ? [...prev, ...incoming] : incoming
      );
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
  };

  const handleLoadMoreFlex = () => {
    // Guardamos la posición del scroll para restaurarla después de cargar,
    // porque al re-renderizar el contenido el navegador sube al tope.
    const scrollBefore = typeof window !== 'undefined' ? window.scrollY : 0;
    loadFlex(flexOffset + flexLimit, true).then(() => {
      if (typeof window !== 'undefined') {
        // requestAnimationFrame espera a que el DOM pinte las partidas nuevas
        requestAnimationFrame(() => {
          window.scrollTo({ top: scrollBefore, behavior: 'smooth' });
        });
      }
    });
  };

  const loadMetrics = async () => {
    try {
      setMetricsLoading(true);
      setMetricsError(null);
      const res = await fetch('/api/player-metrics').then((r) => r.json());
      if (res.status === 'error') {
        setMetricsError(res.errors?.[0]?.message || 'No se pudieron calcular métricas.');
        setPlayerMetrics([]);
      } else {
        setPlayerMetrics(res.metrics || []);
      }
    } catch (err) {
      setMetricsError('Error de red al cargar métricas.');
    } finally {
      setMetricsLoading(false);
    }
  };

  const loadChatHistory = async () => {
    try {
      const res = await fetch('/api/ai/chats').then((r) => r.json());
      setChatHistory(res.chats || []);
    } catch (err) {
      // silencioso
    }
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
          chatId: (aiHistory as any)._chatId || undefined,
          model: aiModel || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiError(data.error || 'La IA no pudo responder');
        return;
      }
      const newChatId = data.chatId;
      const newHistory = [
        ...aiHistory,
        { role: 'user' as const, content: aiMessage },
        { role: 'assistant' as const, content: data.reply },
      ];
      (newHistory as any)._chatId = newChatId;
      setAiHistory(newHistory);
      setAiReply(data.reply);
      setAiMessage('');
      loadChatHistory();
    } catch (err) {
      setAiError('Error de red al contactar la IA');
    } finally {
      setAiLoading(false);
    }
  };

  const handleNewChat = () => {
    setAiHistory([]);
    setAiReply(null);
    setAiMessage('');
    setAiError(null);
    setAiMatchId('');
    setChatHistoryOpen(false);
  };

  const handleLoadChat = (
    messages: { role: 'user' | 'assistant'; content: string }[],
    matchId: string
  ) => {
    const newHistory = [...messages] as any;
    // Preserve _chatId from the loaded messages if present
    setAiHistory(newHistory);
    setAiMatchId(matchId);
    setAiReply(null);
    setAiMessage('');
    setAiError(null);
  };

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
      await loadFlex(0, false);
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
      await loadFlex(0, false);
      await loadMetrics();
      await loadChatHistory();
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

  const handleBalance = async () => {
    if (cPresent.length < 2) return;
    try {
      setBalancing(true);
      setCError(null);
      const res = await fetch('/api/balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerIds: cPresent }),
      }).then((r) => r.json());

      if (!res.success) {
        setCError(res.error || 'No se pudo balancear los equipos.');
        return;
      }
      setCTeamA(res.teamA.map((p: any) => p.memberId));
      setCTeamB(res.teamB.map((p: any) => p.memberId));
      setBalanceInfo(res.balance);
    } catch {
      setCError('Error de red al balancear.');
    } finally {
      setBalancing(false);
    }
  };

  const handleCreateMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cTeamAName || !cTeamBName || cTeamA.length === 0 || cTeamB.length === 0) return;
    try {
      setCError(null);
      const body: any = {
        teamAName: cTeamAName,
        teamBName: cTeamBName,
        teamA: cTeamA,
        teamB: cTeamB,
        winner: cWinner || undefined,
        mvpMemberId: cMvp || undefined,
      };
      if (cScoreA !== '') body.scoreA = Number(cScoreA);
      if (cScoreB !== '') body.scoreB = Number(cScoreB);

      const res = await fetch('/api/customs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setCError(data.error || 'No se pudo registrar la partida');
        return;
      }
      // reset
      setCTeamAName('');
      setCTeamBName('');
      setCTeamA([]);
      setCTeamB([]);
      setCScoreA('');
      setCScoreB('');
      setCWinner('');
      setCMvp('');
      await fetchData();
    } catch (err) {
      setCError('Error de red al registrar la partida');
    }
  };

  const handleDeleteMatch = async (id: string) => {
    if (!confirm('¿Eliminar esta partida de la liga?')) return;
    try {
      await fetch(`/api/customs?id=${id}`, { method: 'DELETE' });
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

              {loading ? (
                <div className="flex flex-col items-center justify-center p-12 text-slate-400 gap-3">
                  <Spinner size="w-8 h-8" className="text-cyan-400" />
                  <span className="text-sm">Trayendo datos de Riot...</span>
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

            {loading ? (
              <div className="flex flex-col items-center justify-center p-12 text-slate-400 gap-3">
                <Spinner size="w-8 h-8" className="text-pink-400" />
                <span className="text-sm">Escaneando historial...</span>
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
                <div className="text-xs text-slate-500 font-mono">
                  {duoData?.scannedMatches} partidas compartidas analizadas · {duoData?.membersAnalyzed} miembros
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

                        <div className="text-[11px] text-slate-500 mt-1 flex justify-between">
                          <span>{d.wins} Ganadas</span>
                          <span>{d.losses} Perdidas</span>
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
              formatFlexDate={formatFlexDate}
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
                  {metricsLoading ? <Spinner size="w-3.5 h-3.5" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">Actualizar</span>
                </button>
              </div>

              {metricsLoading ? (
                <div className="flex flex-col items-center justify-center p-8 text-slate-400 gap-3">
                  <Spinner size="w-6 h-6" className="text-cyan-400" />
                  <span className="text-sm">Calculando métricas...</span>
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

            {flexStatus === 'idle' || flexLoading ? (
              <div className="flex flex-col items-center justify-center p-12 text-slate-400 gap-3">
                <Spinner size="w-8 h-8" className="text-violet-400" />
                <span className="text-sm">Buscando partidas Flex...</span>
              </div>
            ) : flexMatches.length === 0 ? (
              <div className="p-12 text-center text-slate-400 bg-slate-900/40 rounded-xl border border-slate-800">
                <Gamepad2 className="w-10 h-10 mx-auto mb-3 text-slate-600" />
                {flexStatus === 'error'
                  ? 'No se pudo analizar Flex. Revisá los errores arriba.'
                  : 'No se encontraron partidas Flex recientes de los miembros de la squad.'}
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-500 font-mono">
                    Mostrando {flexMatches.length} partidas (de a {flexLimit})
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
          <div className="space-y-8">
            <SectionHeader
              icon={<Crown className="w-5 h-5 text-indigo-400" />}
              title="Liga Interna de Customs"
              description="Fixture, resultados y tabla de posiciones. Victoria = 3 puntos, MVP de la fecha = +1 bonus."
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Formulario: registrar partida */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
                <h3 className="text-lg font-bold flex items-center gap-2 mb-4 text-white">
                  <PlusCircle className="w-5 h-5 text-indigo-400" />
                  Registrar Partida
                </h3>

                {cError && (
                  <div className="mb-4 bg-rose-500/10 border border-rose-500/40 rounded-lg px-3 py-2.5 flex items-start gap-2 text-rose-300 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{cError}</span>
                  </div>
                )}

                <form onSubmit={handleCreateMatch} className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Nombre Equipo A"
                      value={cTeamAName}
                      onChange={(e) => setCTeamAName(e.target.value)}
                      required
                      className="bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                    <input
                      type="text"
                      placeholder="Nombre Equipo B"
                      value={cTeamBName}
                      onChange={(e) => setCTeamBName(e.target.value)}
                      required
                      className="bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Balanceo automático */}
                  <div className="bg-slate-900/60 border border-slate-700/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Scale className="w-4 h-4 text-indigo-400" />
                      <span className="text-xs font-semibold text-slate-300">
                        Balanceo automático
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mb-2.5">
                      Reparte los equipos según el rendimiento real en Flex (WR, KDA, daño, visión).
                    </p>

                    <MultiSelect
                      members={stats.map((s) => s.member)}
                      selected={cPresent}
                      onChange={setCPresent}
                      exclude={[]}
                    />

                    <button
                      type="button"
                      onClick={handleBalance}
                      disabled={balancing || cPresent.length < 2}
                      className="mt-2.5 w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-2 rounded-lg text-xs transition"
                    >
                      {balancing ? (
                        <>
                          <Spinner size="w-3.5 h-3.5" />
                          Balanceando...
                        </>
                      ) : (
                        'Repartir en 2 equipos'
                      )}
                    </button>

                    {balanceInfo && (
                      <div className="mt-2.5 pt-2.5 border-t border-slate-700/50">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] text-slate-500">Balance</span>
                          <span className={`text-[10px] font-bold ${
                            balanceInfo.fair ? 'text-emerald-400' : 'text-amber-400'
                          }`}>
                            {balanceInfo.fair ? 'Equitativo' : `Δ ${balanceInfo.diff}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-mono">
                          <span className="text-slate-500">A: {balanceInfo.avgA}</span>
                          <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-indigo-500 rounded-full"
                              style={{ width: `${balanceInfo.avgA}%` }}
                            />
                          </div>
                          <span className="text-slate-500">B: {balanceInfo.avgB}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Selectores de jugadores */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Jugadores Equipo A</label>
                      <MultiSelect
                        members={stats.map((s) => s.member)}
                        selected={cTeamA}
                        onChange={setCTeamA}
                        exclude={cTeamB}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Jugadores Equipo B</label>
                      <MultiSelect
                        members={stats.map((s) => s.member)}
                        selected={cTeamB}
                        onChange={setCTeamB}
                        exclude={cTeamA}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="number"
                      placeholder="Score A"
                      value={cScoreA}
                      onChange={(e) => setCScoreA(e.target.value)}
                      className="bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                    <input
                      type="number"
                      placeholder="Score B"
                      value={cScoreB}
                      onChange={(e) => setCScoreB(e.target.value)}
                      className="bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                    <select
                      value={cWinner}
                      onChange={(e) => setCWinner(e.target.value as any)}
                      className="bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">¿Ganador?</option>
                      <option value="A">Equipo A</option>
                      <option value="B">Equipo B</option>
                    </select>
                  </div>

                  <select
                    value={cMvp}
                    onChange={(e) => setCMvp(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">MVP de la fecha (opcional)</option>
                    {stats.map((s) => (
                      <option key={s.member.id} value={s.member.id}>
                        {s.member.gameName} ({s.member.nickname})
                      </option>
                    ))}
                  </select>

                  <button
                    type="submit"
                    className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 font-bold py-2.5 rounded-lg text-sm transition"
                  >
                    Registrar Partida
                  </button>
                </form>
              </div>

              {/* Tabla de posiciones */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
                <h3 className="text-lg font-bold flex items-center gap-2 mb-4 text-white">
                  <Medal className="w-5 h-5 text-yellow-400" />
                  Tabla de Posiciones
                </h3>

                {customs && Object.keys(customs.table).length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-sm">
                    <Medal className="w-8 h-8 mx-auto mb-2 text-slate-700" />
                    Aún no hay partidas registradas con resultado.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-slate-500 uppercase tracking-wider border-b border-slate-800">
                          <th className="pb-2">#</th>
                          <th className="pb-2">Jugador</th>
                          <th className="pb-2 text-right">PJ</th>
                          <th className="pb-2 text-right">G</th>
                          <th className="pb-2 text-right">P</th>
                          <th className="pb-2 text-right">MVP</th>
                          <th className="pb-2 text-right font-bold">PTS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customs &&
                          Object.values(customs.table)
                            .sort((a, b) => b.points - a.points)
                            .map((row, i) => {
                              const member = memberById(row.memberId);
                              return (
                                <tr key={row.memberId} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                                  <td className="py-2 font-black text-slate-500">
                                    {i === 0 ? <Crown className="w-4 h-4 text-amber-400 inline" /> : i + 1}
                                  </td>
                                  <td className="py-2">
                                    <div className="font-semibold text-slate-200">
                                      {member?.member.gameName || 'Desconocido'}
                                    </div>
                                    <div className="text-[10px] text-pink-400 italic">
                                      {member?.member.nickname}
                                    </div>
                                  </td>
                                  <td className="py-2 text-right text-slate-400">{row.played}</td>
                                  <td className="py-2 text-right text-emerald-400">{row.won}</td>
                                  <td className="py-2 text-right text-rose-400">{row.lost}</td>
                                  <td className="py-2 text-right text-yellow-400">{row.mvps}</td>
                                  <td className="py-2 text-right font-bold text-white">{row.points}</td>
                                </tr>
                              );
                            })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Historial de partidas */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
              <h3 className="text-lg font-bold flex items-center gap-2 mb-4 text-white">
                <Swords className="w-5 h-5 text-cyan-400" />
                Historial de Partidas
              </h3>

              {customs && customs.matches.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-sm">
                  No hay partidas registradas todavía.
                </div>
              ) : (
                <div className="space-y-3">
                  {customs?.matches
                    .slice()
                    .reverse()
                    .map((m) => (
                      <div
                        key={m.id}
                        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-800/30 border border-slate-800 rounded-xl p-4"
                      >
                        <div className="flex items-center gap-4 flex-wrap">
                          <div className="text-xs text-slate-500 font-mono">
                            {new Date(m.date).toLocaleDateString('es-AR')}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`font-bold ${m.winner === 'A' ? 'text-emerald-400' : 'text-slate-300'}`}>
                              {m.teamAName}
                            </span>
                            {m.scoreA !== undefined && m.scoreB !== undefined && (
                              <span className="text-slate-500 font-mono">
                                {m.scoreA} - {m.scoreB}
                              </span>
                            )}
                            <span className="text-slate-600">vs</span>
                            <span className={`font-bold ${m.winner === 'B' ? 'text-emerald-400' : 'text-slate-300'}`}>
                              {m.teamBName}
                            </span>
                          </div>
                          {m.mvpMemberId && (
                            <div className="flex items-center gap-1 text-xs text-yellow-400">
                              <Medal className="w-3.5 h-3.5" />
                              MVP: {memberById(m.mvpMemberId)?.member.gameName || '—'}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteMatch(m.id)}
                          className="text-slate-500 hover:text-rose-400 transition p-1"
                          title="Eliminar partida"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
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
        Squad LoL Dashboard // Solo datos reales de Riot. Sin placeholders.
      </footer>
    </div>
  );
}

// ---------- Componente: selector múltiple de jugadores ----------
function MultiSelect({
  members,
  selected,
  onChange,
  exclude,
}: {
  members: SquadMember[];
  selected: string[];
  onChange: (v: string[]) => void;
  exclude: string[];
}) {
  const available = members.filter((m) => !exclude.includes(m.id));

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((x) => x !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  if (members.length === 0) {
    return <div className="text-xs text-slate-500 italic">No hay miembros en la squad todavía.</div>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {available.map((m) => {
        const isSel = selected.includes(m.id);
        return (
          <button
            type="button"
            key={m.id}
            onClick={() => toggle(m.id)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
              isSel
                ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200'
                : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:border-slate-500'
            }`}
          >
            {isSel ? <Plus className="w-3 h-3 inline mr-0.5" /> : null}
            {m.gameName}
          </button>
        );
      })}
      {available.length === 0 && (
        <div className="text-xs text-slate-500 italic">Todos los miembros ya están en el otro equipo.</div>
      )}
    </div>
  );
}

// ---------- Helpers para el análisis Flex ----------
function synergyVisual(rating: DuoStat['synergyRating']) {
  switch (rating) {
    case 'GOD_TIER':
      return {
        label: 'God Tier',
        border: 'border-emerald-500/40 shadow-emerald-500/5 shadow-lg',
        badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
        number: 'text-emerald-400',
      };
    case 'REGULAR':
      return {
        label: 'Regular',
        border: 'border-sky-500/30',
        badge: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
        number: 'text-sky-300',
      };
    case 'FRIA':
      return {
        label: 'Fría',
        border: 'border-slate-700',
        badge: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
        number: 'text-slate-300',
      };
    case 'A_PULIR':
      return {
        label: 'A pulir',
        border: 'border-amber-500/30',
        badge: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
        number: 'text-amber-300',
      };
    default:
      return {
        label: rating,
        border: 'border-slate-800',
        badge: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
        number: 'text-slate-100',
      };
  }
}

function formatFlexDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function fmtDmg(dmg: number): string {
  return `${(dmg / 1000).toFixed(1)}k`;
}

function WeakPointIcon({ type }: { type: WeakPoint['type'] }) {
  const cls = 'w-4 h-4 shrink-0';
  switch (type) {
    case 'FED':
      return <Skull className={`${cls} text-rose-400`} />;
    case 'ZERO_IMPACT':
      return <Skull className={`${cls} text-orange-400`} />;
    case 'LOW_DAMAGE':
      return <Crosshair className={`${cls} text-amber-400`} />;
    case 'LOW_VISION':
      return <Eye className={`${cls} text-sky-400`} />;
    case 'DAMAGE_GAP':
      return <Scale className={`${cls} text-purple-400`} />;
    default:
      return <AlertCircle className={`${cls} text-slate-400`} />;
  }
}

function FlexPlayerRow({
  player,
  maxDamage,
}: {
  player: FlexPlayer;
  maxDamage: number;
}) {
  const isSquad = Boolean(player.squadMemberId);
  const kda = `${player.kills}/${player.deaths}/${player.assists}`;
  const dmgShare =
    maxDamage > 0 ? (player.totalDamageDealtToChampions / maxDamage) * 100 : 0;

  return (
    <div
      className={`flex items-center gap-1.5 sm:gap-3 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg ${
        isSquad ? 'bg-violet-500/10 border border-violet-500/30' : 'bg-slate-800/30'
      }`}
    >
      <img
        src={`https://ddragon.leagueoflegends.com/cdn/14.20.1/img/champion/${player.championName}.png`}
        alt={player.championName}
        className="w-7 h-7 sm:w-8 sm:h-8 rounded-md object-cover shrink-0"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className={`text-xs sm:text-sm font-semibold truncate ${
              isSquad ? 'text-violet-200' : 'text-slate-300'
            }`}
          >
            {player.riotIdGameName}
          </span>
          {player.squadNickname && (
            <span className="text-[9px] sm:text-[10px] font-semibold text-pink-400 italic truncate hidden sm:inline">
              "{player.squadNickname}"
            </span>
          )}
        </div>
        <div className="text-[9px] sm:text-[10px] text-slate-500 font-mono truncate">
          {player.championName} · {player.lane}
        </div>
      </div>

      <div className="text-right shrink-0">
        <div
          className={`text-xs sm:text-sm font-bold font-mono ${
            player.deaths >= 6
              ? 'text-rose-400'
              : player.kills === 0 && player.deaths >= 4
              ? 'text-orange-400'
              : 'text-slate-200'
          }`}
        >
          {kda}
        </div>
        <div className="text-[9px] sm:text-[10px] text-slate-500">KDA</div>
      </div>

      <div className="w-16 sm:w-28 shrink-0">
        <div className="text-[10px] sm:text-xs font-mono text-cyan-300 text-right">
          {fmtDmg(player.totalDamageDealtToChampions)}
        </div>
        <div className="h-1 sm:h-1.5 bg-slate-800 rounded-full mt-1 overflow-hidden">
          <div
            className="h-full bg-cyan-500 rounded-full"
            style={{ width: `${Math.max(2, dmgShare)}%` }}
          />
        </div>
      </div>

      <div className="text-right w-8 sm:w-12 shrink-0">
        <div className="text-[10px] sm:text-xs font-mono text-slate-300">{player.visionScore}</div>
        <div className="text-[9px] sm:text-[10px] text-slate-500">vis</div>
      </div>
    </div>
  );
}

function FlexMatchCard({ match }: { match: FlexMatch }) {
  const maxDamage = Math.max(
    ...match.teams.flatMap((t) => t.players.map((p) => p.totalDamageDealtToChampions)),
    1
  );

  // Resumen de resultado desde la perspectiva de la squad
  const squadWins = match.squadMembers.filter((m) => m.win).length;
  const squadLosses = match.squadMembers.length - squadWins;

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-3 sm:px-4 py-2 sm:py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 sm:gap-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500" />
          <span className="text-xs sm:text-sm text-slate-300 font-mono">
            {formatFlexDate(match.date)}
          </span>
          <span className="flex items-center gap-1 text-[10px] sm:text-xs text-slate-500 font-mono">
            <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            {formatDuration(match.duration)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          <span className="text-[9px] sm:text-[10px] font-mono bg-slate-800 text-slate-400 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full border border-slate-700">
            v{match.gameVersion.split('.')[0]}.{match.gameVersion.split('.')[1]}
          </span>
          <span className="text-[9px] sm:text-[10px] font-mono bg-violet-500/10 text-violet-300 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full border border-violet-500/30">
            {match.squadMemberCount} de la squad
          </span>
          {squadWins > 0 && (
            <span className="text-[9px] sm:text-[10px] font-mono bg-emerald-500/10 text-emerald-300 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full border border-emerald-500/30">
              {squadWins}V
            </span>
          )}
          {squadLosses > 0 && (
            <span className="text-[9px] sm:text-[10px] font-mono bg-rose-500/10 text-rose-300 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full border border-rose-500/30">
              {squadLosses}D
            </span>
          )}
        </div>
      </div>

      {/* Miembros de la squad en la partida */}
      <div className="px-4 py-2 border-b border-slate-800/60 flex flex-wrap gap-1.5">
        {match.squadMembers.map((m) => (
          <span
            key={m.id}
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
              m.win
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
            }`}
          >
            {m.win ? <CheckCircle2 className="w-3 h-3" /> : <X className="w-3 h-3" />}
            {m.gameName} <span className="italic text-pink-400">"{m.nickname}"</span>
          </span>
        ))}
      </div>

      {/* Equipos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3 p-2 sm:p-4">
        {match.teams.map((team) => (
          <div
            key={team.teamId}
            className={`rounded-xl border p-2 sm:p-3 space-y-1.5 sm:space-y-2 ${
              team.win
                ? 'bg-emerald-500/5 border-emerald-500/20'
                : 'bg-rose-500/5 border-rose-500/20'
            }`}
          >
            <div className="flex items-center justify-between mb-0.5 sm:mb-1">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="text-[10px] sm:text-xs font-bold text-slate-400">
                  Equipo {team.teamId === 100 ? 'A' : 'B'}
                </span>
                <span
                  className={`text-[9px] sm:text-[10px] font-black uppercase px-1 sm:px-1.5 py-0.5 rounded ${
                    team.win
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-rose-500/20 text-rose-300'
                  }`}
                >
                  {team.win ? 'Victoria' : 'Derrota'}
                </span>
              </div>
              <span className="text-[10px] sm:text-xs font-mono text-cyan-300">
                Daño: {fmtDmg(team.totalDamage)}
              </span>
            </div>
            {team.players
              .slice()
              .sort((a, b) => b.totalDamageDealtToChampions - a.totalDamageDealtToChampions)
              .map((p) => (
                <FlexPlayerRow key={p.puuid} player={p} maxDamage={maxDamage} />
              ))}
          </div>
        ))}
      </div>

      {/* Puntos débiles */}
      {match.weakPoints.length > 0 && (
        <div className="px-3 sm:px-4 pb-3 sm:pb-4">
          <div className="text-[9px] sm:text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1.5 sm:mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            Puntos débiles de la partida
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2">
            {match.weakPoints.map((wp, i) => (
              <div
                key={i}
                className="flex items-start gap-1.5 sm:gap-2 bg-slate-800/40 border border-slate-700/50 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2"
              >
                <WeakPointIcon type={wp.type} />
                <div className="min-w-0">
                  <div className="text-[10px] sm:text-xs font-bold text-slate-200">{wp.title}</div>
                  <div className="text-[9px] sm:text-[11px] text-slate-400">{wp.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
