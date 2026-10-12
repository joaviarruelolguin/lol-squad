# LoL Squad Stats

Dashboard de League of Legends para un grupo de amigos. ranks, sinergias, análisis de partidas Flex, premios y liga de customs. Todo con datos reales de la API de Riot — sin números inventados.

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Tailwind](https://img.shields.io/badge/Tailwind-4-38bdf8)

---

## Qué hace

| Sección | Qué muestra |
|---------|-------------|
| **Tabla de posiciones** | Banner del MVP de la semana (arriba de todo), rank Flex/Solo de cada miembro, winrate, LP, campeones más jugados |
| **Análisis de Flex** | Partidas Flex paginadas con KDA, daño, visión, puntos débiles, y un Coach IA que las analiza |
| **Sinergia** | Matriz de dúos y tríos, recomendador de composición, tendencias por jugador |
| **Stats** | Premios automáticos (el que más se murió, ward bot, racha...), promedios por jugador, tilt meter |
| **Semanal** | Resumen generado por IA con 3 cosas para mejorar por jugador |
| **Liga de Customs** | Tabla de posiciones interna, historial de partidas y balanceo automático de equipos |

### El MVP de la semana

Arriba de la tabla de posiciones hay un banner que corona al mejor jugador de la
semana. No es decorativo: se calcula con datos reales de las partidas Flex.

**La ventana es la semana calendario** (lunes 00:00 hasta ahora), no una ventana
rodante. Eso es lo que hace que el título se renueva: el ganador queda congelado
durante la semana y el lunes arranca uno nuevo. Si es lunes a la mañana y todavía
no jugaron, cae a los últimos 7 días para no dejar el banner vacío.

**Cómo se arma el puntaje** (0 a 100):

| Métrica | Peso | Vale 100% en... |
|---|---|---|
| Winrate | 35 | 65% |
| KDA | 25 | 4.0 |
| Momentum (últimos 5 juegos) | 15 | 80% de winrate |
| Damage share | 15 | 28% del daño del equipo |
| Visión | 10 | 45 de vision score |

Dos decisiones hacen que el número signifique algo:

- **Las referencias son constantes, no el mejor de la squad.** Si normalizáramos
  contra el máximo de la semana, el ganador sacaría 100 en cada métrica y los
  puntajes no serían comparables entre semanas, que es lo que sirve para el "le
  ganó a".
- **El puntaje se encoge por tamaño de muestra** (`games / (games + 3)` hacia la
  media de la squad). Con 1 partida el jugador pesa 25% y con 3 pesa 50%: frena
  que un 1/1 al 100% se lleve el título. El banner marca "muestra chica" cuando
  el ganador jugó menos de 3 partidas.

El banner muestra además la racha, los últimos 5 resultados como cuadraditos, el
campeón más jugado, el podio con 2º y 3º, cuánto falta para la renovación y el
desglose de cómo se calculó el puntaje (se despliega con un click).

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
git clone https://github.com/joaviarruelolguin/lol-squad.git
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
NEXT_PUBLIC_APP_REPO_URL=https://github.com/tu-usuario/lol-squad

# URL pública. Opcional: en Vercel se detecta sola.
# Solo ponela si usás un dominio propio. De esto depende que la imagen de
# preview funcione al compartir el link por WhatsApp/Telegram.
NEXT_PUBLIC_SITE_URL=https://tu-dominio.com
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
npm run test     # tests (vitest)
npm run test:watch
```

### Tests

235 tests sobre la lógica que no se ve en pantalla: clasificación de errores de Riot, rate limiting, validación de input, TTL y tope de la caché, enmascarado de la API key, el mapeo región → shard, el parseo de match IDs y el cálculo completo del MVP semanal.

```bash
npm run test
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
│   │   ├── mvp/                # MVP semanal (banner del ranking)
│   │   ├── weekly/             # resumen semanal con IA
│   │   ├── ai/chat/            # Coach IA (Gemini)
│   │   ├── ai/chats/           # historial de chats
│   │   ├── customs/            # liga interna
│   │   ├── squad/              # CRUD de miembros
│   │   ├── riot-key/           # gestión de API key
│   │   └── cache/              # control de caché
│   ├── page.tsx                # dashboard principal (orquesta tabs y estado compartido)
│   ├── layout.tsx              # metadatos, Open Graph y fuentes
│   ├── opengraph-image.tsx     # imagen de preview al compartir el link
│   └── not-found.tsx
├── components/                 # una pestaña o panel por archivo
│   ├── SquadTab.tsx            # tabla de posiciones + alta de miembros
│   ├── MvpBanner.tsx           # banner del MVP semanal
│   ├── DDragonImage.tsx        # imagen de DDragon con fallback
│   ├── ConfirmDialog.tsx       # confirmación de acciones destructivas
│   ├── ShareButton.tsx         # compartir por WhatsApp o copiar el link
│   ├── DuosTab.tsx             # sinergias (trends + tríos + composición + dúos)
│   ├── FlexTab.tsx             # chat IA + métricas + listado Flex paginado
│   ├── CustomsTab.tsx          # liga interna
│   ├── StatsTab.tsx            # premios, promedios y tilt meter
│   ├── WeeklyTab.tsx           # resumen semanal con IA
│   ├── CoachIA.tsx             # chat con Gemini
│   ├── FlexMatchCard.tsx       # tarjeta de partida
│   ├── RiotKeyManager.tsx      # badge de estado + modal de la API key
│   ├── Skeleton.tsx            # primitivas de carga
│   └── ...
├── hooks/                      # useCachedFetch, etc.
└── lib/                        # lógica de negocio
    ├── riot.ts                 # cliente de Riot + rate limiter adaptativo
    ├── matchCache.ts           # caché persistente de partidas (Supabase)
    ├── squadMatches.ts         # historial Flex de la squad, normalizado y compartido
    ├── matchId.ts              # parseo de match IDs (fecha y routing)
    ├── mvp.ts                  # cálculo del MVP semanal (testeable)
    ├── ddragonUrls.ts          # URLs de imágenes de DDragon
    ├── rateLimit.ts            # rate limiting por endpoint
    ├── validate.ts             # validación de input de los POST
    ├── riotKey.ts              # gestión de API key
    ├── supabase.ts             # cliente Supabase (lazy)
    ├── storage.ts              # squad (híbrido)
    ├── customs.ts              # liga (híbrido)
    ├── synergy.ts              # cálculo de sinergias (testeable)
    ├── errors.ts               # clasificación de errores
    ├── cache.ts                # caché en memoria con tope de tamaño
    ├── config.ts               # configuración de la app
    └── types.ts                # tipos compartidos
```

### Decisiones de diseño

**Todo dato viene de Riot.** No hay mocks ni placeholders. Si la API falla, se muestra el error real traducido.

**Caché en dos niveles:**
1. En memoria (5 min por proceso) — evita re-fetch dentro de la misma operación y entre endpoints
2. En Supabase (`match_cache`) — las partidas ya descargadas no vuelven a pedirse a Riot, ni después de reiniciar el server

Los endpoints que analizan partidas comparten ese dataset a través de
`squadMatches.ts`, que pide los match IDs una sola vez, lee `match_cache` una vez
y normaliza los participantes. Cada endpoint hace su propia agregación encima.
Antes cada uno repetía los pedidos a Riot, el SELECT y hasta el `JSON.parse` de
las mismas ~100 partidas: abrir la pestaña Sinergia lo hacía tres veces en
paralelo.

**El match ID de Riot se_parsea antes de pedir detalles.** El ID trae la hora de
arranque y el shard adentro (`LA2_6801234567`), así que se filtran y ordenan
partidas por fecha y por routing sin gastar un request. Eso baja tanto el trabajo
del MVP semanal (de ~40 partidas a ~4) como el de los endpoints con ventana, y
evita que un jugador de EUW1 en la squad haga fallar sus partidas con 404.

**Rate limiting adaptativo:** el cliente serializa las peticiones a 2 req/s y, cuando Riot devuelve 429, sube el piso de espera de toda la cola (`RateLimiter.penalize`) en vez de solo la request que falló. Sin eso, un 429 disparaba una cascada en la que cada request fallaba dos veces y esperaba el doble.

**Aliados vs rivales:** el Coach IA sabe qué PUUIDs son de la squad y marca cada jugador como `[ALIADO]` o `[RIVAL]` en el contexto, para que no critique a los enemigos.

---

## Rendimiento

Las claves de desarrollo de Riot dan **2 requests por segundo**. Analizar la squad (5 jugadores × 20 partidas) son ~40 partidas distintas, así que la primera vez hay un piso físico de unos 20 segundos.

| Situación | Tiempo |
|---|---|
| Primer request tras reiniciar el server, sin Supabase | ~30s (trae todo de Riot) |
| Requests siguientes | ~20ms |
| Con Supabase configurado | La 2ª vez que se abre la app en días ya no pide nada a Riot |

**La primera carga es lenta por diseño, no por un bug.** Se puede acortar de dos maneras:

1. **Configurá Supabase.** La tabla `match_cache` persiste las partidas entre reinicios. Es lo que hace que en producción la app abra en segundos después del primer uso.
2. **Tolerá la primera carga.** Las siguientes son instantáneas mientras el server no se reinicie.

### Invalidar la caché

Si los datos te parecen viejos, el botón **⚡ Forzar** en el header limpia las cachés del servidor (Riot, catálogo de campeones y dataset de partidas), la de fetch del cliente y fuerza el recálculo en las pestañas ya abiertas. El botón **⟳ Actualizar** es el suave: relee del caché.

El badge junto al botón dice de cuándo son los datos, que en una app que lee de
la API de Riot no es lo mismo que "ahora".

---

## Licencia

MIT

---

Si te sirvió o querés armar la tuya, el código está abierto: [github.com/joaviarruelolguin/lol-squad](https://github.com/joaviarruelolguin/lol-squad).