import { ImageResponse } from 'next/og';
import { APP_TITLE, APP_SUBTITLE } from '@/lib/config';

export const alt = APP_TITLE;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Imagen de preview para cuando comparten el link por WhatsApp, Telegram o
 * Twitter. Sin esto los bots muestran un link pelado sin nada de contexto.
 *
 * Usa la misma paleta GitHub-dark que la app para que se vea la misma marca.
 */
export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#0d1117',
          padding: '72px 80px',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Barra superior de acento */}
        <div style={{ display: 'flex', height: 8, gap: 12 }}>
          <div style={{ flex: 1, background: '#58a6ff', borderRadius: 4 }} />
          <div style={{ flex: 1, background: '#3fb950', borderRadius: 4 }} />
          <div style={{ flex: 1, background: '#d29922', borderRadius: 4 }} />
          <div style={{ flex: 1, background: '#f85149', borderRadius: 4 }} />
        </div>

        {/* Título */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontSize: 78,
              fontWeight: 800,
              color: '#e6edf3',
              letterSpacing: -2,
              lineHeight: 1.05,
            }}
          >
            {APP_TITLE}
          </div>
          <div
            style={{
              marginTop: 22,
              fontSize: 32,
              color: '#8b949e',
              fontWeight: 500,
            }}
          >
            {APP_SUBTITLE}
          </div>
        </div>

        {/* Features */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {[
            { label: 'Rank Flex', color: '#58a6ff' },
            { label: 'Sinergias', color: '#3fb950' },
            { label: 'Análisis de partidas', color: '#d29922' },
            { label: 'Coach con IA', color: '#bc8cff' },
          ].map((f) => (
            <div
              key={f.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 22px',
                borderRadius: 999,
                border: `1px solid ${f.color}55`,
                background: `${f.color}14`,
                color: f.color,
                fontSize: 26,
                fontWeight: 600,
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: f.color,
                }}
              />
              {f.label}
            </div>
          ))}
        </div>

        {/* Pie */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 24,
            color: '#484f58',
          }}
        >
          <span>League of Legends · datos reales de la API de Riot</span>
          <span style={{ fontFamily: 'monospace' }}>open source · MIT</span>
        </div>
      </div>
    ),
    size
  );
}
