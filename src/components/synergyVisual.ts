import { DuoStat } from '@/lib/types';

/**
 * Estilo visual de cada nivel de sinergia (dúos).
 *
 * Nota: los colores difieren de los de tríos a propósito. En dúos el neutro
 * gris es "fría" porque el filtro neutral; en tríos el ámbar marca "fría" para
 * que resalte entre tarjetas. No unificar.
 */
export function synergyVisual(rating: DuoStat['synergyRating']) {
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
