'use client';

import { useState, useEffect } from 'react';
import { CalendarDays, Sparkles, RefreshCw, ChevronDown, Target, Trophy, Info } from 'lucide-react';
import { WeeklyPlayerStat, WeeklySummary } from '@/lib/types';

const Spinner = ({ size = 'w-5 h-5', className = '' }: { size?: string; className?: string }) => (
  <svg className={`animate-spin ${size} ${className}`} viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

// Renderizador de markdown simple para el texto de la IA
function AiText({ text }: { text: string }) {
  const renderInline = (t: string): React.ReactNode => {
    const parts = t.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) =>
      p.startsWith('**') && p.endsWith('**') ? (
        <strong key={i} className="font-semibold text-slate-100">{p.slice(2, -2)}</strong>
      ) : (
        <span key={i}>{p}</span>
      )
    );
  };
  return (
    <div className="space-y-1.5 text-sm leading-relaxed text-slate-300">
      {text.split('\n').map((line, i) => (
        line.trim() ? <p key={i}>{renderInline(line)}</p> : <div key={i} className="h-1" />
      ))}
    </div>
  );
}

interface WeeklyTabProps {
  members: { id: string; gameName: string; nickname: string; profileIconId: number }[];
}

export default function WeeklyTab({ members }: WeeklyTabProps) {
  const [weeks, setWeeks] = useState(4);
  const [playerStats, setPlayerStats] = useState<WeeklyPlayerStat[]>([]);
  const [summaries, setSummaries] = useState<WeeklySummary[]>([]);
  const [matchesInWindow, setMatchesInWindow] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [openSummary, setOpenSummary] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/weekly?weeks=${weeks}`).then((r) => r.json());
      if (res.error) {
        setError(res.error);
      } else {
        setPlayerStats(res.playerStats || []);
        const loaded = res.summaries || [];
        setSummaries(loaded);
        setMatchesInWindow(res.matchesInWindow || 0);
        // Abrimos el resumen más reciente automáticamente para que el
        // contenido no quede escondido detrás del acordeón.
        setOpenSummary((prev) => prev ?? loaded[0]?.id ?? null);
      }
    } catch {
      setError('Error de red al cargar el resumen.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeks]);

  const generate = async () => {
    try {
      setGenerating(true);
      setGenError(null);
      const res = await fetch('/api/weekly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weeks }),
      }).then((r) => r.json());

      if (!res.success) {
        setGenError(res.error || 'No se pudo generar el resumen.');
        return;
      }
      await load();
      setOpenSummary(res.summary.id);
    } catch {
      setGenError('Error de red al generar el resumen.');
    } finally {
      setGenerating(false);
    }
  };

  const memberById = (id: string) => members.find((m) => m.id === id);

  return (
    <div className="space-y-6">
      {/* Controles */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-semibold text-slate-200">Período</span>
          <div className="flex gap-1 bg-slate-800 rounded-lg p-0.5">
            {[1, 2, 4, 8].map((w) => (
              <button
                key={w}
                onClick={() => setWeeks(w)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition ${
                  weeks === w
                    ? 'bg-violet-500 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {w === 1 ? '1 sem' : `${w} sem`}
              </button>
            ))}
          </div>
          {matchesInWindow > 0 && (
            <span className="text-[11px] text-slate-500 font-mono">
              {matchesInWindow} partidas
            </span>
          )}
        </div>

        <button
          onClick={generate}
          disabled={generating || loading}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold text-sm px-4 py-2 rounded-lg transition"
        >
          {generating ? <Spinner size="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
          {generating ? 'Analizando...' : 'Generar resumen semanal'}
        </button>
      </div>

      {/* Explicación de por qué no hay resúmenes aún */}
      {summaries.length === 0 && playerStats.length > 0 && (
        <div className="flex items-start gap-2 text-[10px] text-slate-500 bg-slate-900/30 border border-slate-800/60 rounded-lg px-3 py-2">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            Los resúmenes se guardan en Supabase. Si el botón te dice que falta configuración,
            revisá las variables <code className="text-slate-400">SUPABASE_URL</code> y{' '}
            <code className="text-slate-400">SUPABASE_SERVICE_ROLE_KEY</code> en tu{' '}
            <code className="text-slate-400">.env.local</code> o en Vercel.
          </span>
        </div>
      )}

      {genError && (
        <div className="bg-amber-500/10 border border-amber-500/40 rounded-lg px-3 py-2.5 text-amber-300 text-xs">
          {genError}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 gap-3 text-slate-400">
          <Spinner size="w-8 h-8" className="text-violet-400" />
          <span className="text-sm">Cargando estadísticas de la semana...</span>
        </div>
      ) : error ? (
        <div className="bg-rose-500/10 border border-rose-500/40 rounded-lg px-3 py-2 text-rose-300 text-xs">
          {error}
        </div>
      ) : (
        <>
          {/* Resúmenes generados */}
          {summaries.length > 0 && (
            <div className="space-y-2">
              {summaries.map((s) => {
                const isOpen = openSummary === s.id;
                let improvements: { gameName: string; tips: string[] }[] = [];
                try {
                  improvements = typeof s.improvements === 'string'
                    ? JSON.parse(s.improvements)
                    : s.improvements;
                } catch {
                  improvements = [];
                }

                return (
                  <div key={s.id} className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setOpenSummary(isOpen ? null : s.id)}
                      className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-800/50 transition"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="text-left">
                          <div className="text-sm font-bold text-white">
                            {new Date(s.week_start).toLocaleDateString('es-AR')} →{' '}
                            {new Date(s.week_end).toLocaleDateString('es-AR')}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {s.matches_analyzed} partidas · {s.squad_winrate}% WR
                          </div>
                        </div>
                      </div>
                      <ChevronDown
                        className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${
                          isOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    {isOpen && (
                      <div className="px-4 pb-4 space-y-4 border-t border-slate-800">
                        {/* Highlights */}
                        <div>
                          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">
                            <Trophy className="w-3.5 h-3.5" />
                            Resumen de la semana
                          </div>
                          <AiText text={s.highlights} />
                        </div>

                        {/* Mejoras por jugador */}
                        <div>
                          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">
                            <Target className="w-3.5 h-3.5" />
                            3 cosas para mejorar por jugador
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {improvements.map((imp, i) => {
                              const member = members.find(
                                (m) => m.gameName.toLowerCase() === imp.gameName?.toLowerCase()
                              );
                              return (
                                <div
                                  key={i}
                                  className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3"
                                >
                                  <div className="flex items-center gap-2 mb-2">
                                    {member && (
                                      <img
                                        src={`https://ddragon.leagueoflegends.com/cdn/14.20.1/img/profileicon/${member.profileIconId}.png`}
                                        alt={imp.gameName}
                                        className="w-6 h-6 rounded border border-slate-600"
                                      />
                                    )}
                                    <span className="text-xs font-bold text-slate-200">
                                      {imp.gameName}
                                    </span>
                                  </div>
                                  <ul className="space-y-1">
                                    {imp.tips?.map((tip, j) => (
                                      <li key={j} className="text-[11px] text-slate-400 flex gap-1.5">
                                        <span className="text-slate-600">•</span>
                                        <span>{tip}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Tabla de stats */}
          {playerStats.length > 0 && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-3">
                Estadísticas del período
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[600px]">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-800">
                      <th className="text-left py-2 font-semibold">Jugador</th>
                      <th className="text-right py-2 font-semibold">Partidas</th>
                      <th className="text-right py-2 font-semibold">WR</th>
                      <th className="text-right py-2 font-semibold">KDA</th>
                      <th className="text-right py-2 font-semibold">Daño</th>
                      <th className="text-right py-2 font-semibold">Visión</th>
                      <th className="text-right py-2 font-semibold">CS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playerStats.map((p, i) => {
                      const member = memberById(p.memberId);
                      return (
                        <tr key={p.memberId} className="border-b border-slate-800/50 last:border-0">
                          <td className="py-2 flex items-center gap-2">
                            <span className="text-slate-600 font-mono w-4">{i + 1}</span>
                            {member && (
                              <img
                                src={`https://ddragon.leagueoflegends.com/cdn/14.20.1/img/profileicon/${member.profileIconId}.png`}
                                alt={p.gameName}
                                className="w-6 h-6 rounded border border-slate-600"
                              />
                            )}
                            <span className="font-semibold text-slate-200">{p.gameName}</span>
                          </td>
                          <td className="py-2 text-right font-mono text-slate-400">
                            {p.wins}V/{p.losses}D
                          </td>
                          <td className={`py-2 text-right font-mono font-bold ${
                            p.winrate >= 50 ? 'text-emerald-400' : 'text-rose-400'
                          }`}>
                            {p.winrate}%
                          </td>
                          <td className="py-2 text-right font-mono text-slate-300">{p.avgKDA}</td>
                          <td className="py-2 text-right font-mono text-cyan-300">
                            {(p.avgDamage / 1000).toFixed(1)}k
                          </td>
                          <td className="py-2 text-right font-mono text-slate-300">{p.avgVision}</td>
                          <td className="py-2 text-right font-mono text-slate-300">{p.avgCS}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Estado vacío: hay stats pero falta generar el resumen con IA */}
          {summaries.length === 0 && playerStats.length > 0 && (
            <div className="bg-violet-500/10 border border-violet-500/30 rounded-xl p-4 flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-violet-200 mb-1">
                  Falta generar el análisis
                </div>
                <p className="text-xs text-slate-400 mb-3">
                  Las estadísticas de arriba son datos reales. Para obtener el resumen con IA y las
                  3 cosas para mejorar por jugador, tocá{' '}
                  <b className="text-violet-300">"Generar resumen semanal"</b> arriba.
                </p>
                <button
                  onClick={generate}
                  disabled={generating}
                  className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold text-xs px-4 py-2 rounded-lg transition"
                >
                  {generating ? <Spinner size="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {generating ? 'Analizando...' : 'Generar ahora'}
                </button>
              </div>
            </div>
          )}

          {playerStats.length === 0 && summaries.length === 0 && (
            <div className="p-8 text-center text-slate-500 text-sm bg-slate-900/40 rounded-xl border border-slate-800">
              No hay partidas suficientes en este período. Probá con un rango más largo.
            </div>
          )}
        </>
      )}
    </div>
  );
}