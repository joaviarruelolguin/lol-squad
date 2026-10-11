'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Bot, Clock, Plus, AlertCircle, Cpu, CircleCheck } from 'lucide-react';
import { FlexMatch } from '@/lib/types';
import LaneDiffPanel from './LaneDiffPanel';
import { formatFlexDate } from './FlexMatchCard';
import { Skeleton } from './Skeleton';

// Spinner reutilizable
const Spinner = ({ size = 'w-5 h-5', className = '' }: { size?: string; className?: string }) => (
  <svg className={`animate-spin ${size} ${className}`} viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

// Renderizador de markdown ligero
const MarkdownText = ({ text }: { text: string }) => {
  const renderLine = (line: string, key: number) => {
    if (line.startsWith('#### ')) {
      return <h5 key={key} className="font-bold text-slate-100 mt-2 mb-1 text-xs">{renderInline(line.slice(5))}</h5>;
    }
    if (line.startsWith('### ')) {
      return <h4 key={key} className="font-bold text-slate-100 mt-2 mb-1 text-sm">{renderInline(line.slice(4))}</h4>;
    }
    if (line.startsWith('## ')) {
      return <h3 key={key} className="font-bold text-slate-100 mt-2 mb-1 text-sm">{renderInline(line.slice(3))}</h3>;
    }
    if (line.startsWith('# ')) {
      return <h2 key={key} className="font-bold text-slate-100 mt-2 mb-1 text-base">{renderInline(line.slice(2))}</h2>;
    }
    if (line.startsWith('- ') || line.startsWith('• ')) {
      return (
        <div key={key} className="flex gap-1.5 ml-2">
          <span className="text-slate-500">•</span>
          <span>{renderInline(line.slice(2))}</span>
        </div>
      );
    }
    return <p key={key} className="leading-relaxed">{renderInline(line)}</p>;
  };

  const renderInline = (text: string): React.ReactNode => {
    const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-semibold text-slate-100">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        return <em key={i} className="italic text-slate-300">{part.slice(1, -1)}</em>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  const lines = text.split('\n');
  return <div className="space-y-1">{lines.map((line, i) => renderLine(line, i))}</div>;
};

interface ChatHistoryItem {
  id: string;
  title: string;
  matchId: string;
  messageCount: number;
  updatedAt: string;
}

interface CoachIAProps {
  flexMatches: FlexMatch[];
  aiMatchId: string;
  setAiMatchId: (v: string) => void;
  aiMessage: string;
  setAiMessage: (v: string) => void;
  aiHistory: { role: 'user' | 'assistant'; content: string }[];
  aiLoading: boolean;
  aiError: string | null;
  chatExpanded: boolean;
  setChatExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  matchPickerOpen: boolean;
  setMatchPickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  chatHistory: ChatHistoryItem[];
  chatHistoryOpen: boolean;
  setChatHistoryOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleAiChat: (e: React.FormEvent) => void;
  handleNewChat: () => void;
  loadChatHistory: () => Promise<void>;
  onLoadChat: (messages: { role: 'user' | 'assistant'; content: string }[], matchId: string) => void;
  selectedModel: string;
  onModelChange: (m: string) => void;
}

export default function CoachIA({
  flexMatches,
  aiMatchId,
  setAiMatchId,
  aiMessage,
  setAiMessage,
  aiHistory,
  aiLoading,
  aiError,
  chatExpanded,
  setChatExpanded,
  matchPickerOpen,
  setMatchPickerOpen,
  chatHistory,
  chatHistoryOpen,
  setChatHistoryOpen,
  handleAiChat,
  handleNewChat,
  loadChatHistory,
  onLoadChat,
  selectedModel,
  onModelChange,
}: CoachIAProps) {
  const historyRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);
  const [modelOpen, setModelOpen] = useState(false);

  const MODELS = [
    { id: '', label: 'Automático', desc: 'Fallback con reintentos' },
    { id: 'gemini-3.8-flash', label: 'Flash 3.8', desc: 'Rápido' },
    { id: 'gemini-3.7-flash', label: 'Flash 3.7', desc: 'Estable' },
    { id: 'gemini-3.5-flash', label: 'Flash 3.5', desc: 'Liviano' },
    { id: 'gemini-3-flash-preview', label: 'Flash 3 preview', desc: 'Preview' },
  ];

  // Cerrar dropdowns al clickear afuera
  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (historyRef.current && !historyRef.current.contains(t)) {
        setChatHistoryOpen(false);
      }
      if (pickerRef.current && !pickerRef.current.contains(t)) {
        setMatchPickerOpen(false);
      }
      if (modelRef.current && !modelRef.current.contains(t)) {
        setModelOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
        <h3 className="text-base font-bold flex items-center gap-2 text-white">
          <Bot className="w-5 h-5 text-emerald-400" />
          Coach IA
          <span className="text-[10px] font-normal text-slate-500">
            (Beta · Gemini gratuito)
          </span>
        </h3>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          {/* Historial de chats */}
          <div className="relative" ref={historyRef}>
            <button
              onClick={() => setChatHistoryOpen((v) => !v)}
              className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium transition"
              title="Historial de chats"
            >
              <Clock className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Chats</span>
              {chatHistory.length > 0 && (
                <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {chatHistory.length}
                </span>
              )}
            </button>
            {chatHistoryOpen && (
              <div className="absolute left-0 sm:left-auto sm:right-0 z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-800 text-xs font-semibold text-slate-400">
                  Historial de chats
                </div>
                {chatHistory.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-slate-500 text-center">
                    No hay chats guardados
                  </div>
                ) : (
                  <div className="max-h-64 overflow-y-auto">
                    {chatHistory.map((c) => (
                      <button
                        key={c.id}
                        onClick={async () => {
                          try {
                            const res = await fetch('/api/ai/chats', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ chatId: c.id }),
                            }).then((r) => r.json());
                            if (res.chat) {
                              const msgs = res.chat.messages || [];
                              (msgs as any)._chatId = c.id;
                              setAiMatchId(res.chat.matchId || '');
                              setChatHistoryOpen(false);
                              onLoadChat(msgs, res.chat.matchId || '');
                            }
                          } catch (err) {
                            // silencioso
                          }
                        }}
                        className="w-full text-left px-3 py-2.5 hover:bg-slate-800 transition border-b border-slate-800/50"
                      >
                        <div className="text-xs font-medium text-slate-200 truncate">
                          {c.title}
                        </div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5">
                          <span>{c.messageCount} mensajes</span>
                          <span>·</span>
                          <span>{new Date(c.updatedAt).toLocaleDateString('es-AR')}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            onClick={handleNewChat}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Nuevo</span>
          </button>
          <button
            onClick={() => setChatExpanded((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium transition"
          >
            {chatExpanded ? 'Comprimir' : 'Expandir'}
          </button>
          {/* Selector de modelo */}
          <div className="relative" ref={modelRef}>
            <button
              onClick={() => setModelOpen((v) => !v)}
              className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium transition"
              title="Modelo de IA"
            >
              <Cpu className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">
                {MODELS.find((m) => m.id === selectedModel)?.label || 'Auto'}
              </span>
            </button>
            {modelOpen && (
              <div className="absolute right-0 left-auto z-30 mt-2 w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
                {MODELS.map((m) => (
                  <button
                    key={m.id || 'auto'}
                    onClick={() => {
                      onModelChange(m.id);
                      setModelOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 hover:bg-slate-800 transition flex items-center justify-between gap-2 ${
                      selectedModel === m.id ? 'bg-emerald-500/10' : ''
                    }`}
                  >
                    <div>
                      <div className={`text-xs font-semibold ${
                        selectedModel === m.id ? 'text-emerald-300' : 'text-slate-200'
                      }`}>
                        {m.label}
                      </div>
                      <div className="text-[10px] text-slate-500">{m.desc}</div>
                    </div>
                    {selectedModel === m.id && (
                      <CircleCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Selector de partida personalizado */}
      <div className="relative mb-3" ref={pickerRef}>
        <button
          onClick={() => setMatchPickerOpen((v) => !v)}
          className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2.5 text-sm text-left flex items-center justify-between gap-2 hover:border-slate-600 transition"
        >
          <span className={aiMatchId ? 'text-slate-100' : 'text-slate-500'}>
            {aiMatchId
              ? (() => {
                  const m = flexMatches.find((fm) => fm.matchId === aiMatchId);
                  return m
                    ? `${formatFlexDate(m.date)} · ${m.squadMembers
                        .map((s) => s.gameName)
                        .join(' + ')}`
                    : 'Partida seleccionada';
                })()
              : 'Elegí una partida Flex...'}
          </span>
          <span className="text-slate-500 text-xs shrink-0">
            {matchPickerOpen ? '▲' : '▼'}
          </span>
        </button>

        {matchPickerOpen && (
          <div className="absolute z-20 mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg shadow-xl max-h-64 overflow-y-auto">
            {flexMatches.length === 0 ? (
              <div className="p-3 space-y-2" aria-busy="true" aria-label="Cargando partidas">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <Skeleton className="h-2 w-24" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                ))}
              </div>
            ) : (
              flexMatches.map((m) => (
                <button
                  key={m.matchId}
                  onClick={() => {
                    setAiMatchId(m.matchId);
                    setMatchPickerOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-800 transition flex flex-col gap-0.5 ${
                    aiMatchId === m.matchId
                      ? 'bg-emerald-500/10 text-emerald-200'
                      : 'text-slate-200'
                  }`}
                >
                  <span className="font-semibold text-xs text-slate-400">
                    {formatFlexDate(m.date)}
                  </span>
                  <span className="truncate">
                    {m.squadMembers.map((s) => s.gameName).join(' + ')}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Diferenciales de línea (se comprime junto con el chat) */}
      {aiMatchId && chatExpanded && (
        <div className="mt-4">
          <LaneDiffPanel matchId={aiMatchId} />
        </div>
      )}

      {chatExpanded && (
        <>
          {/* Mensajes del chat */}
          {aiHistory.length > 0 && (
            <div className="space-y-2 max-h-64 overflow-y-auto mt-4 mb-3">
              {aiHistory.map((h, i) => (
                <div
                  key={i}
                  className={`text-xs rounded-lg px-3 py-2 ${
                    h.role === 'user'
                      ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-100'
                      : 'bg-slate-800/60 border border-slate-700 text-slate-200'
                  }`}
                >
                  <div className="font-bold mb-0.5">
                    {h.role === 'user' ? 'Vos' : 'Coach'}
                  </div>
                  {h.role === 'user' ? (
                    <div className="whitespace-pre-wrap">{h.content}</div>
                  ) : (
                    <MarkdownText text={h.content} />
                  )}
                </div>
              ))}
            </div>
          )}

          {aiError && (
            <div className="bg-rose-500/10 border border-rose-500/40 rounded-lg px-3 py-2.5 text-rose-300 text-xs flex items-start gap-2 mb-3">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold mb-0.5">
                  {aiError.includes('saturados') || aiError.includes('high demand')
                    ? 'Gemini está saturado ahora mismo'
                    : 'No se pudo consultar a la IA'}
                </div>
                <div className="text-rose-200/80">
                  {aiError.includes('saturados') || aiError.includes('high demand') ? (
                    <>
                      Es un problema temporal de Google, no de la app. Probá de nuevo en un rato
                      o cambiá el modelo con el botón <Cpu className="inline w-3 h-3" />.
                    </>
                  ) : (
                    aiError
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={handleAiChat}
            className="flex flex-col sm:flex-row gap-2 mt-5 pt-4 border-t border-slate-800/60"
          >
            <input
              type="text"
              value={aiMessage}
              onChange={(e) => setAiMessage(e.target.value)}
              placeholder="Ej: resumí la partida y dame 3 tips..."
              className="flex-1 bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              disabled={aiLoading || !aiMatchId}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-4 py-2 rounded-lg text-sm transition flex items-center justify-center gap-2 min-w-[120px]"
            >
              {aiLoading ? (
                <>
                  <Spinner size="w-4 h-4" />
                  <span>Preparando respuesta...</span>
                </>
              ) : (
                'Preguntar'
              )}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
