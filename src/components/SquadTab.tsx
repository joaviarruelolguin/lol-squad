'use client';

import { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Crown,
  PlusCircle,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import { MemberResult } from '@/lib/types';
import { profileIconUrl, championSquareUrl } from '@/lib/ddragonUrls';
import { Skeleton } from './Skeleton';
import Spinner from './Spinner';
import MvpBanner from './MvpBanner';

const ROLES = [
  { value: 'TOP', label: 'Top' },
  { value: 'JUNGLE', label: 'Jungle' },
  { value: 'MID', label: 'Mid' },
  { value: 'ADC', label: 'ADC' },
  { value: 'SUPPORT', label: 'Support' },
  { value: 'FILL', label: 'Fill / Comodín' },
] as const;

const REGIONS = [
  { value: 'la2', label: 'LA2 — LATAM Norte (ARG, MEX, BRA...)' },
  { value: 'la1', label: 'LA1 — LATAM Sur (CHL, PER...)' },
  { value: 'br1', label: 'BR1 — Brasil' },
  { value: 'na1', label: 'NA1 — Norteamérica' },
  { value: 'euw1', label: 'EUW1 — Europa oeste' },
] as const;

export function getRankBadgeColor(tier?: string) {
  switch (tier?.toUpperCase()) {
    case 'CHALLENGER':
      return 'bg-amber-500/20 text-amber-300 border-amber-500/50';
    case 'GRANDMASTER':
      return 'bg-red-500/20 text-red-300 border-red-500/50';
    case 'MASTER':
      return 'bg-purple-500/20 text-purple-300 border-purple-500/50';
    case 'DIAMOND':
      return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50';
    case 'EMERALD':
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50';
    case 'PLATINUM':
      return 'bg-teal-500/20 text-teal-300 border-teal-500/50';
    case 'GOLD':
      return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50';
    case 'SILVER':
      return 'bg-slate-400/20 text-slate-300 border-slate-400/50';
    case 'BRONZE':
      return 'bg-orange-700/20 text-orange-400 border-orange-700/50';
    default:
      return 'bg-zinc-700/20 text-zinc-400 border-zinc-600/50';
  }
}

/**
 * Tarjeta de un miembro de la squad: posición, avatar, rango, winrate y sus
 * campeones más jugados.
 *
 * Orientado a Flex: si el jugador tiene rango Flex mostramos ese (con badge
 * "FLEX") y solo caemos a SoloQ si no tiene.
 */
function MemberCard({
  item,
  idx,
  onDelete,
}: {
  item: MemberResult;
  idx: number;
  onDelete: (id: string) => void;
}) {
  const rank = item.flexQueue || item.soloQueue;
  const queueLabel = item.flexQueue ? 'FLEX' : item.soloQueue ? 'SOLOQ' : '';

  // Estado de error total: no pudimos resolver la identidad
  if (item.status === 'error' && !rank) {
    const errMsg =
      item.errors.account?.message ||
      item.errors.rank?.message ||
      'No se pudieron obtener datos de Riot.';
    return (
      <div className="bg-rose-950/20 border border-rose-800/50 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-6 text-center text-rose-400 font-black">#{idx + 1}</div>
          <img
            src={profileIconUrl(item.member.profileIconId)}
            alt=""
            width={48}
            height={48}
            decoding="async"
            className="w-12 h-12 rounded-xl border border-rose-800/40 object-cover grayscale"
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-base">
                {item.member.gameName}
              </span>
              <span className="text-xs text-slate-400">
                #{item.member.tagLine}
              </span>
            </div>
            <div className="text-xs font-semibold text-pink-400 italic">
              "{item.member.nickname}"
            </div>
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
            onClick={() => onDelete(item.member.id)}
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
    <div className="bg-slate-900/60 border border-slate-800/80 hover:border-slate-700/80 rounded-xl overflow-hidden transition shadow-sm">
      {/* Banner de advertencia si hay errores parciales */}
      {item.status === 'partial' && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 flex items-center gap-2 text-amber-300 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            Datos parciales:
            {item.errors.account && ' · identidad'}
            {item.errors.rank && ' · rango'}
            {item.errors.mastery && ' · campeones'}{' '}
            no disponibles.
          </span>
        </div>
      )}

      <div className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="text-lg font-black text-slate-500 w-6 text-center">
            {idx === 0 && rank ? (
              <Crown className="w-6 h-6 text-amber-400 inline" />
            ) : (
              `#${idx + 1}`
            )}
          </div>

          <div className="relative">
            <img
              src={profileIconUrl(item.member.profileIconId)}
              alt=""
              width={48}
              height={48}
              decoding="async"
              className="w-12 h-12 rounded-xl border border-slate-700 object-cover"
            />
            <span className="absolute -bottom-2 -right-1 text-[10px] font-bold bg-slate-800 px-1.5 py-0.5 rounded border border-slate-600 text-slate-300">
              {item.member.role || 'FILL'}
            </span>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-base">
                {item.member.gameName}
              </span>
              <span className="text-xs text-slate-400">
                #{item.member.tagLine}
              </span>
            </div>
            <div className="text-xs font-semibold text-pink-400 italic">
              "{item.member.nickname}"
            </div>
          </div>
        </div>

        {/* STATS */}
        <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end">
          {/* RANGO */}
          <div className="text-right">
            {rank ? (
              <>
                <div className="flex items-center justify-end gap-1.5">
                  <span
                    className={`inline-block px-2.5 py-0.5 text-xs font-bold rounded-md border ${getRankBadgeColor(rank.tier)}`}
                  >
                    {rank.tier} {rank.rank}
                  </span>
                  {queueLabel && (
                    <span className="inline-block px-1.5 py-0.5 text-[10px] font-black rounded-md bg-violet-500/20 text-violet-300 border border-violet-500/40">
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
                <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                  Sin rango
                </div>
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
            onClick={() => onDelete(item.member.id)}
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
              <div
                key={c.championId}
                className="flex items-center gap-2 bg-slate-800/50 rounded-lg px-2.5 py-1.5"
              >
                <img
                  src={championSquareUrl(c.championName)}
                  alt=""
                  width={28}
                  height={28}
                  loading="lazy"
                  decoding="async"
                  className="w-7 h-7 rounded-md object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <div>
                  <div className="text-xs font-semibold text-slate-200">
                    {c.championName}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Nv.{c.championLevel} ·{' '}
                    {(c.championPoints / 1000).toFixed(0)}k pts
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-slate-500 italic">
            {item.errors.mastery
              ? item.errors.mastery.message
              : 'Sin datos de maestría (quizás no jugó partidas clasificatorias recientes).'}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Pestaña de la squad: tabla de posiciones con los miembros y el formulario
 * para sumar a alguien nuevo (verificado contra la API de Riot).
 */
export default function SquadTab({
  stats,
  loading,
  onChanged,
}: {
  stats: MemberResult[];
  loading: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const [gameName, setGameName] = useState('');
  const [tagLine, setTagLine] = useState('');
  const [nickname, setNickname] = useState('');
  const [role, setRole] = useState<string>('FILL');
  const [region, setRegion] = useState<string>('la2');
  const [submitting, setSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gameName || !tagLine) return;

    try {
      setSubmitting(true);
      setAddError(null);
      const res = await fetch('/api/squad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameName, tagLine, nickname, role, region }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error || 'No se pudo agregar el invocador');
        return;
      }
      // Si el server lo encontró en otro shard, lo avisamos y ajustamos el
      // select para que las altas siguientes salgan por el camino bueno.
      if (data.member?.region && data.member.region !== region) {
        setRegion(data.member.region);
      }
      setGameName('');
      setTagLine('');
      setNickname('');
      await onChanged();
    } catch {
      setAddError('Error de red al agregar el invocador');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Seguro que querés sacar a este manco de la squad?')) return;
    try {
      await fetch(`/api/squad?id=${id}`, { method: 'DELETE' });
      await onChanged();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-4">
        {/* MVP de la semana: va primero, arriba de todo, porque es lo que la
            squad viene a ver. Solo se monta cuando hay miembros para calcular. */}
        {stats.length > 0 && <MvpBanner />}

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
          <div
            className="space-y-3"
            aria-busy="true"
            aria-label="Cargando tabla de posiciones"
          >
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
            <Users className="w-10 h-10 mx-auto mb-3 text-slate-500" />
            La squad está vacía. Agregá al primer invocador con el formulario.
          </div>
        ) : (
          <div className="space-y-3">
            {stats.map((item, idx) => (
              <MemberCard
                key={item.member.id}
                item={item}
                idx={idx}
                onDelete={handleDelete}
              />
            ))}
          </div>
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
            Ingresá el Riot ID (Game Name + Tag). Lo verificamos contra la API
            de Riot: si no existe o la key está vencida, no lo guardamos.
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
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Game Name
                </label>
                <input
                  type="text"
                  placeholder="ej: bigJoao"
                  value={gameName}
                  onChange={(e) => setGameName(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Tag
                </label>
                <input
                  type="text"
                  placeholder="LAS"
                  value={tagLine}
                  onChange={(e) => setTagLine(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
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
                className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Servidor
              </label>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
              >
                {REGIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                Si te dice que la cuenta existe pero no la encuentra, probá el
                otro servidor de LATAM.
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Rol Principal
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
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
  );
}
