# LoL Squad Stats

Dashboard de League of Legends para un grupo de amigos. ranks, sinergias, análisis de partidas Flex, premios y liga de customs. Todo con datos reales de la API de Riot — sin números inventados.

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Tailwind](https://img.shields.io/badge/Tailwind-4-38bdf8)

---

## Qué hace

| Sección | Qué muestra |
|---------|-------------|
| **Tabla de posiciones** | Rank Flex/Solo de cada miembro, winrate, LP, campeones más jugados |
| **Análisis de Flex** | Partidas Flex paginadas con KDA, daño, visión, puntos débiles, y un Coach IA que las analiza |
| **Sinergia** | Matriz de dúos y tríos, recomendador de composición, tendencias por jugador |
| **Stats** | Premios automáticos (el que más se murió, ward bot, racha...), promedios por jugador, tilt meter |
| **Semanal** | Resumen generado por IA con 3 cosas para mejorar por jugador |
| **Liga de Customs** | Tabla de posiciones interna, historial de partidas y balanceo automático de equipos |

---

## Requisitos

- Node.js 18 o superior
- Una API key de [Riot Developer](https://developer.riotgames.com) (gratis, pero **expira cada 24h**)
- Una API key de [Google AI Studio](https://aistudio.google.com) para el Coach IA (opcional)
- Una instancia de [Supabase](https://supabase.com) para persistencia en la nube (opcional en local)

---

## Instalación

```bash
# 1. Clonar el repo
git clone https://github.com/tu-usuario/lol-squad.git
cd lol-squad

# 2. Instalar dependencias
npm install

# 3. Crear el archivo de variables de entorno
cp .env.example .env.local
```

Editá `.env.local` y completá las claves (ver abajo).

```bash
# 4. Levantar en desarrollo
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000).

---

## Variables de entorno

### Obligatorias para hablar con Riot

```env
RIOT_API_KEY=RGAPI-tu-key-aquí
RIOT_REGION=americas
RIOT_ROUTING=la2
```

- `RIOT_API_KEY`: se genera en [developer.riotgames.com](https://developer.riotgames.com) → "API Key (Development)" → Generate.
  **Ojo: expira a las 24 horas.** Cuando vence, la app muestra un badge rojo arriba.
- `RIOT_REGION`: `americas` para NA/BR, `europe` para EU.
- `RIOT_ROUTING`: el shard regional del jugador. `la2` = LATAM Norte (LAS, ARG, etc.), `la1` = LATAM Sur.

### Opcionales

```env
# Coach IA (si no lo ponés, el chat queda deshabilitado)
GEMINI_API_KEY=tu-key-de-google-ai-studio
GEMINI_MODEL=gemini-3.8-flash

# Persistencia en la nube (si no lo ponés, se usan archivos locales)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Personalización
NEXT_PUBLIC_APP_TITLE=LoL Squad Stats
NEXT_PUBLIC_APP_SUBTITLE=Datos reales de Riot. Sin inventos.
NEXT_PUBLIC_APP_DESCRIPTION=Dashboard de LoL para tu squad
```

### Sin Supabase: todo funciona igual

Si no configurás Supabase, la app guarda todo en archivos locales (`data/*.json`) y anda perfecto en desarrollo. Supabase solo hace falta si querés deployar en Vercel (donde no se puede escribir en disco) o querés que los datos persistan entre máquinas.

---

## Configurar Supabase (para deploy)

1. Creá un proyecto en [supabase.com](https://supabase.com) (plan free).
2. Abrí el **SQL Editor**, pegá el contenido de [`supabase/schema.sql`](./supabase/schema.sql) y ejecutalo.
3. En **Project Settings → API** copiá:
   - `Project URL` → `SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

> La `service_role` key tiene permisos completos. Solo se usa en el servidor (API routes), nunca llega al navegador.

---

## Deploy en Vercel

1. Subí el repo a GitHub.
2. Importalo en [vercel.com](https://vercel.com).
3. Agregá las variables de entorno en **Project Settings → Environment Variables**.
4. Deploy. Listo.

Cuando la API key de Riot venza (cada 24h), editá `RIOT_API_KEY` en Vercel y se redeploya solo.

También podés cambiar la key desde la misma app: botón **"Cambiar API key"** en la barra superior. La app la valida contra Riot antes de guardarla.

---

## Scripts

```bash
npm run dev      # desarrollo (Turbopack, hot reload)
npm run build    # build de producción
npm run start    # correr el build de producción
npm run lint     # linter
```

---

## Cómo está armado

```
src/
├── app/
│   ├── api/                    # API routes (solo servidor)
│   │   ├── stats/              # ranks + identidad
│   │   ├── duos/               # sinergias de dúos
│   │   ├── trios/              # sinergias de tríos
│   │   ├── flex-matches/       # partidas Flex paginadas
│   │   ├── lane-diff/          # diferenciales oro/XP por línea
│   │   ├── player-metrics/     # promedios agregados
│   │   ├── player-stats/       # premios y tilt meter
│   │   ├── trends/             # patrones de muerte/racha
│   │   ├── composition/        # combos de campeones
│   │   ├── balance/            # balanceo de equipos
│   │   ├── weekly/             # resumen semanal con IA
│   │   ├── ai/chat/            # Coach IA (Gemini)
│   │   ├── ai/chats/           # historial de chats
│   │   ├── customs/            # liga interna
│   │   ├── squad/              # CRUD de miembros
│   │   ├── riot-key/           # gestión de API key
│   │   └── cache/              # control de caché
│   ├── page.tsx                # dashboard principal
│   └── layout.tsx
├── components/                 # componentes de UI
├── hooks/                      # useCachedFetch, etc.
└── lib/                        # lógica de negocio
    ├── riot.ts                 # cliente de Riot + rate limiter
    ├── riotKey.ts              # gestión de API key
    ├── matchCache.ts           # caché persistente en Supabase
    ├── supabase.ts             # cliente Supabase (lazy)
    ├── storage.ts              # squad (híbrido)
    ├── customs.ts              # liga (híbrido)
    ├── errors.ts               # clasificación de errores
    ├── cache.ts                # caché en memoria
    ├── config.ts               # configuración de la app
    └── types.ts                # tipos compartidos
```

### Decisiones de diseño

**Todo dato viene de Riot.** No hay mocks ni placeholders. Si la API falla, se muestra el error real traducido.

**Caché en dos niveles:**
1. En memoria (por request) — evita re-fetch dentro de la misma operación
2. En Supabase (`match_cache`) — las partidas ya descargadas no vuelven a pedirse a Riot

**Rate limiting propio:** el cliente serializa las peticiones a 2 req/s (el límite de las dev keys) y reintenta con backoff exponencial ante 429/5xx.

**Aliados vs rivales:** el Coach IA sabe qué PUUIDs son de la squad y marca cada jugador como `[ALIADO]` o `[RIVAL]` en el contexto, para que no critique a los enemigos.

---

## Licencia

MIT