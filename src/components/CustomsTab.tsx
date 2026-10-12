'use client';

import { useState } from 'react';
import {
  AlertCircle,
  Crown,
  Medal,
  PlusCircle,
  Scale,
  Swords,
  Trash2,
} from 'lucide-react';
import { CustomMatch, MemberResult, TableRow } from '@/lib/types';
import SectionHeader from './SectionHeader';
import MultiSelect from './MultiSelect';
import Spinner from './Spinner';

interface CustomsData {
  matches: CustomMatch[];
  table: Record<string, TableRow>;
}

/**
 * Liga interna de customs: formulario para registrar partidas, tabla de
 * posiciones e historial.
 *
 * El componente es dueño de su propio estado de formulario. Lo único que le
 * pasa la página es la lista de miembros (para los selectores) y un callback
 * `onChanged` para que el padre refresque los datos después de crear o borrar.
 */
export default function CustomsTab({
  members,
  customs,
  onChanged,
  memberById,
}: {
  members: MemberResult[];
  customs: CustomsData | null;
  onChanged: () => Promise<void> | void;
  memberById: (id: string) => MemberResult | undefined;
}) {
  const [teamAName, setTeamAName] = useState('');
  const [teamBName, setTeamBName] = useState('');
  const [teamA, setTeamA] = useState<string[]>([]);
  const [teamB, setTeamB] = useState<string[]>([]);
  const [scoreA, setScoreA] = useState('');
  const [scoreB, setScoreB] = useState('');
  const [winner, setWinner] = useState<'A' | 'B' | ''>('');
  const [mvp, setMvp] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Balanceo automático
  const [present, setPresent] = useState<string[]>([]);
  const [balancing, setBalancing] = useState(false);
  const [balanceInfo, setBalanceInfo] = useState<{
    avgA: number;
    avgB: number;
    diff: number;
    fair: boolean;
  } | null>(null);

  const allMembers = members.map((m) => m.member);

  const handleBalance = async () => {
    if (present.length < 2) return;
    try {
      setBalancing(true);
      setError(null);
      const res = await fetch('/api/balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerIds: present }),
      }).then((r) => r.json());

      if (!res.success) {
        setError(res.error || 'No se pudo balancear los equipos.');
        return;
      }
      setTeamA(res.teamA.map((p: { memberId: string }) => p.memberId));
      setTeamB(res.teamB.map((p: { memberId: string }) => p.memberId));
      setBalanceInfo(res.balance);
    } catch {
      setError('Error de red al balancear.');
    } finally {
      setBalancing(false);
    }
  };

  const resetForm = () => {
    setTeamAName('');
    setTeamBName('');
    setTeamA([]);
    setTeamB([]);
    setScoreA('');
    setScoreB('');
    setWinner('');
    setMvp('');
  };

  const handleCreateMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamAName || !teamBName || teamA.length === 0 || teamB.length === 0) {
      return;
    }
    try {
      setError(null);
      const body: Record<string, unknown> = {
        teamAName,
        teamBName,
        teamA,
        teamB,
        winner: winner || undefined,
        mvpMemberId: mvp || undefined,
      };
      if (scoreA !== '') body.scoreA = Number(scoreA);
      if (scoreB !== '') body.scoreB = Number(scoreB);

      const res = await fetch('/api/customs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'No se pudo registrar la partida');
        return;
      }
      resetForm();
      await onChanged();
    } catch {
      setError('Error de red al registrar la partida');
    }
  };

  const handleDeleteMatch = async (id: string) => {
    if (!confirm('¿Eliminar esta partida de la liga?')) return;
    try {
      await fetch(`/api/customs?id=${id}`, { method: 'DELETE' });
      await onChanged();
    } catch (err) {
      console.error(err);
    }
  };

  return (
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

          {error && (
            <div className="mb-4 bg-rose-500/10 border border-rose-500/40 rounded-lg px-3 py-2.5 flex items-start gap-2 text-rose-300 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleCreateMatch} className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Nombre Equipo A"
                value={teamAName}
                onChange={(e) => setTeamAName(e.target.value)}
                required
                className="bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <input
                type="text"
                placeholder="Nombre Equipo B"
                value={teamBName}
                onChange={(e) => setTeamBName(e.target.value)}
                required
                className="bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
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
                Reparte los equipos según el rendimiento real en Flex (WR, KDA,
                daño, visión).
              </p>

              <MultiSelect
                members={allMembers}
                selected={present}
                onChange={setPresent}
                exclude={[]}
              />

              <button
                type="button"
                onClick={handleBalance}
                disabled={balancing || present.length < 2}
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
                    <span
                      className={`text-[10px] font-bold ${
                        balanceInfo.fair ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
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
                <label className="text-xs text-slate-400 block mb-1">
                  Jugadores Equipo A
                </label>
                <MultiSelect
                  members={allMembers}
                  selected={teamA}
                  onChange={setTeamA}
                  exclude={teamB}
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Jugadores Equipo B
                </label>
                <MultiSelect
                  members={allMembers}
                  selected={teamB}
                  onChange={setTeamB}
                  exclude={teamA}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <input
                type="number"
                placeholder="Score A"
                value={scoreA}
                onChange={(e) => setScoreA(e.target.value)}
                className="bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <input
                type="number"
                placeholder="Score B"
                value={scoreB}
                onChange={(e) => setScoreB(e.target.value)}
                className="bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <select
                value={winner}
                onChange={(e) => setWinner(e.target.value as 'A' | 'B' | '')}
                className="bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
              >
                <option value="">¿Ganador?</option>
                <option value="A">Equipo A</option>
                <option value="B">Equipo B</option>
              </select>
            </div>

            <select
              value={mvp}
              onChange={(e) => setMvp(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
            >
              <option value="">MVP de la fecha (opcional)</option>
              {members.map((s) => (
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
                          <tr
                            key={row.memberId}
                            className="border-b border-slate-800/50 hover:bg-slate-800/30"
                          >
                            <td className="py-2 font-black text-slate-500">
                              {i === 0 ? (
                                <Crown className="w-4 h-4 text-amber-400 inline" />
                              ) : (
                                i + 1
                              )}
                            </td>
                            <td className="py-2">
                              <div className="font-semibold text-slate-200">
                                {member?.member.gameName || 'Desconocido'}
                              </div>
                              <div className="text-[10px] text-pink-400 italic">
                                {member?.member.nickname}
                              </div>
                            </td>
                            <td className="py-2 text-right text-slate-400">
                              {row.played}
                            </td>
                            <td className="py-2 text-right text-emerald-400">
                              {row.won}
                            </td>
                            <td className="py-2 text-right text-rose-400">
                              {row.lost}
                            </td>
                            <td className="py-2 text-right text-yellow-400">
                              {row.mvps}
                            </td>
                            <td className="py-2 text-right font-bold text-white">
                              {row.points}
                            </td>
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
                      <span
                        className={`font-bold ${
                          m.winner === 'A' ? 'text-emerald-400' : 'text-slate-300'
                        }`}
                      >
                        {m.teamAName}
                      </span>
                      {m.scoreA !== undefined && m.scoreB !== undefined && (
                        <span className="text-slate-500 font-mono">
                          {m.scoreA} - {m.scoreB}
                        </span>
                      )}
                      <span className="text-slate-500">vs</span>
                      <span
                        className={`font-bold ${
                          m.winner === 'B' ? 'text-emerald-400' : 'text-slate-300'
                        }`}
                      >
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
  );
}
