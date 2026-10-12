'use client';

import { memo, useMemo } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Crosshair,
  Eye,
  Scale,
  Skull,
  X,
} from 'lucide-react';
import { FlexMatch, FlexPlayer, WeakPoint } from '@/lib/types';
import DDragonImage from './DDragonImage';

export function formatFlexDate(iso: string): string {
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

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function fmtDmg(dmg: number): string {
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

/**
 * Fila de un jugador dentro de la tarjeta de partida.
 *
 * Memoizada: se renderizan 10 por tarjeta, y la lista de partidas crece sin
 * límite con "Cargar más". Sin memo, recargar una partida re-renderiza las
 * 10 filas aunque solo haya cambiado una.
 */
const FlexPlayerRow = memo(function FlexPlayerRow({
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
      <DDragonImage
        kind="champion"
        value={player.championName}
        size={32}
        alt=""
        fallback="?"
        className="w-7 h-7 sm:w-8 sm:h-8 rounded-md object-cover shrink-0"
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
            <span className="text-[10px] sm:text-[10px] font-semibold text-pink-400 italic truncate hidden sm:inline">
              "{player.squadNickname}"
            </span>
          )}
        </div>
        <div className="text-[10px] sm:text-[10px] text-slate-400 font-mono truncate">
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
        <div className="text-[10px] sm:text-xs text-slate-400">KDA</div>
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
        <div className="text-[10px] sm:text-xs font-mono text-slate-200">
          {player.visionScore}
        </div>
        <div className="text-[10px] sm:text-xs text-slate-400">vis</div>
      </div>
    </div>
  );
});

/**
 * Tarjeta de una partida Flex: header con fecha/duración/resultado de la squad,
 * chips de miembros, los dos equipos con sus 10 jugadores y los puntos débiles
 * detectados por el análisis.
 */
export default memo(function FlexMatchCard({ match }: { match: FlexMatch }) {
  // `Math.max` sobre ~20 jugadores y el orden por daño de cada equipo se
  // calculaban en cada render, y el array ordenado era nuevo cada vez (así que
  // las filas memoizadas no podían evitar nada).
  const maxDamage = useMemo(
    () =>
      Math.max(
        ...match.teams.flatMap((t) =>
          t.players.map((p) => p.totalDamageDealtToChampions)
        ),
        1
      ),
    [match]
  );

  const sortedTeams = useMemo(
    () =>
      match.teams.map((team) => ({
        ...team,
        orderedPlayers: [...team.players].sort(
          (a, b) => b.totalDamageDealtToChampions - a.totalDamageDealtToChampions
        ),
      })),
    [match]
  );

  // Resumen de resultado desde la perspectiva de la squad
  const squadWins = match.squadMembers.filter((m) => m.win).length;
  const squadLosses = match.squadMembers.length - squadWins;

  return (
    <div className="cv-auto bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
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
          <div className="text-[10px] sm:text-xs font-mono text-slate-400 bg-slate-800 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full border border-slate-700">
            v{match.gameVersion.split('.')[0]}.{match.gameVersion.split('.')[1]}
          </div>
          <span className="text-[10px] sm:text-xs font-mono bg-violet-500/10 text-violet-300 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full border border-violet-500/30">
            {match.squadMemberCount} de la squad
          </span>
          {squadWins > 0 && (
            <span className="text-[10px] sm:text-xs font-mono bg-emerald-500/10 text-emerald-300 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full border border-emerald-500/30">
              {squadWins}V
            </span>
          )}
          {squadLosses > 0 && (
            <span className="text-[10px] sm:text-xs font-mono bg-rose-500/10 text-rose-300 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full border border-rose-500/30">
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
            {m.win ? (
              <CheckCircle2 className="w-3 h-3" />
            ) : (
              <X className="w-3 h-3" />
            )}
            {m.gameName}{' '}
            <span className="italic text-pink-400">"{m.nickname}"</span>
          </span>
        ))}
      </div>

      {/* Equipos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3 p-2 sm:p-4">
        {sortedTeams.map((team) => (
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
                <span className="text-[11px] sm:text-xs font-bold text-slate-300">
                  Equipo {team.teamId === 100 ? 'A' : 'B'}
                </span>
                <span
                  className={`text-[10px] sm:text-xs font-black uppercase px-1 sm:px-1.5 py-0.5 rounded ${
                    team.win
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-rose-500/20 text-rose-300'
                  }`}
                >
                  {team.win ? 'Victoria' : 'Derrota'}
                </span>
              </div>
              <span className="text-[11px] sm:text-xs font-mono text-cyan-300">
                Daño: {fmtDmg(team.totalDamage)}
              </span>
            </div>
            {team.orderedPlayers.map((p) => (
              <FlexPlayerRow key={p.puuid} player={p} maxDamage={maxDamage} />
            ))}
          </div>
        ))}
      </div>

      {/* Puntos débiles */}
      {match.weakPoints.length > 0 && (
        <div className="px-3 sm:px-4 pb-3 sm:pb-4">
          <div className="text-[10px] sm:text-xs uppercase tracking-wider text-slate-400 font-bold mb-1.5 sm:mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            Puntos débiles de la partida
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2">
            {match.weakPoints.map((wp, i) => (
              <div
                key={`${wp.type}-${i}`}
                className="flex items-start gap-1.5 sm:gap-2 bg-slate-800/40 border border-slate-700/50 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2"
              >
                <WeakPointIcon type={wp.type} />
                <div className="min-w-0">
                  <div className="text-[11px] sm:text-xs font-bold text-slate-200">
                    {wp.title}
                  </div>
                  <div className="text-[11px] sm:text-xs text-slate-300">
                    {wp.detail}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
