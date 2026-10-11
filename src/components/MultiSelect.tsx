'use client';

import { Plus } from 'lucide-react';
import { SquadMember } from '@/lib/types';

/**
 * Selector múltiple de jugadores, en formato chips.
 *
 * Se usa en la liga de customs para armar los dos equipos. Los miembros que
 * ya están en el otro equipo se ocultan (`exclude`) para evitar el error
 * clásico de poner al mismo jugador en los dos lados.
 */
export default function MultiSelect({
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
    return (
      <div className="text-xs text-slate-500 italic">
        No hay miembros en la squad todavía.
      </div>
    );
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
        <div className="text-xs text-slate-500 italic">
          Todos los miembros ya están en el otro equipo.
        </div>
      )}
    </div>
  );
}
