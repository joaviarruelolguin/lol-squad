'use client';

import { AlertTriangle, Flame, ShieldAlert } from 'lucide-react';
import { DuoResult } from '@/lib/types';
import SectionHeader from './SectionHeader';
import TrendsPanel from './TrendsPanel';
import TrioPanel from './TrioPanel';
import CompositionPanel from './CompositionPanel';
import { synergyVisual } from './synergyVisual';
import { Skeleton } from './Skeleton';

/**
 * Pestaña de sinergia: con quién les va mejor.
 *
 * Arriba los paneles que se cargan solos (tendencias, tríos, composición) y
 * abajo la grilla de dúos, que depende de `duoData` porque lo trae la página
 * en el mismo fetch que las stats de la squad.
 */
export default function DuosTab({
  duoData,
  loading,
}: {
  duoData: DuoResult | null;
  loading: boolean;
}) {
  return (
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
            <div
              key={i}
              className="text-xs text-amber-200/80 flex items-start gap-2"
            >
              <span className="font-mono text-amber-400/70">[{e.type}]</span>
              <span>{e.message}</span>
            </div>
          ))}
        </div>
      )}

      {loading && !duoData ? (
        <div
          className="space-y-4"
          aria-busy="true"
          aria-label="Cargando sinergias"
        >
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
          <ShieldAlert className="w-10 h-10 mx-auto mb-3 text-slate-500" />
          {duoData.status === 'error'
            ? 'No se pudo analizar sinergias. Revisá los errores arriba.'
            : 'No se encontraron partidas recientes donde hayan jugado 2+ miembros de la squad juntos.'}
        </div>
      ) : (
        <>
          <div className="space-y-1">
            <div className="text-xs text-slate-500 font-mono">
              {duoData?.scannedMatches} partidas compartidas analizadas ·{' '}
              {duoData?.membersAnalyzed} miembros
            </div>
            <div className="text-[11px] text-slate-500">
              Solo dúos con 2+ partidas juntos · últimas 20 partidas Flex de cada
              jugador
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
                    <span className="text-xs text-slate-400 font-mono">
                      {d.totalGames} juntos
                    </span>
                  </div>

                  <div className="space-y-1 mb-4">
                    <div className="text-sm font-semibold text-slate-200">
                      {d.player1Name}
                    </div>
                    <div className="text-xs text-slate-500 font-mono text-center">
                      +
                    </div>
                    <div className="text-sm font-semibold text-slate-200">
                      {d.player2Name}
                    </div>
                  </div>

                  <div className="border-t border-slate-800/80 pt-3 flex items-center justify-between">
                    <span className="text-xs text-slate-400">Winrate Duo:</span>
                    <div className="text-xl font-black">
                      <span className={syn.number}>{d.winrate}%</span>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-500 mt-1 flex justify-between items-center">
                    <span className="text-emerald-400/80">{d.wins} ganadas</span>
                    <span className="text-slate-500 font-mono text-[10px]">
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
  );
}
