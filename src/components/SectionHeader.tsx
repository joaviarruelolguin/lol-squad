import React from 'react';

/**
 * Encabezado de sección: título + ícono + descripción + badge opcional.
 * Lo usan todas las pestañas para mantener la misma jerarquía visual.
 */
export default function SectionHeader({
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
