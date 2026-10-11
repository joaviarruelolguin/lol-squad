# Deploy Squad LoL Dashboard en Vercel + Supabase

## 1. Crear el proyecto en Supabase

1. Entrá a https://supabase.com y creá un proyecto (plan free).
2. En el **SQL Editor**, pegá el contenido de `supabase/schema.sql` y ejecutarlo.
3. Andá a **Project Settings → API** y copiá:
   - `Project URL` → `SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

> ⚠️ La `service_role` key es sensible. Solo se usa en el backend (API routes), nunca al frontend.

## 2. Configurar variables en Vercel

1. Subí el repo a GitHub e importalo en Vercel.
2. En **Project Settings → Environment Variables**, agregá:

| Variable | Valor |
|----------|-------|
| `RIOT_API_KEY` | Tu key de developer.riotgames.com (empieza con `RGAPI-`) |
| `RIOT_REGION` | `americas` |
| `RIOT_ROUTING` | `la2` |
| `GEMINI_API_KEY` | Tu key de aistudio.google.com |
| `GEMINI_MODEL` | `gemini-3.8-flash` |
| `SUPABASE_URL` | `https://xxxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | La key `service_role` de Supabase |

3. Deploy.

> En Vercel NO se puede escribir al filesystem, por eso la API key de Riot se guarda
> en Supabase (tabla `riot_key`) y el badge de countdown la lee de ahí.

## 2.b. Renovar la API key de Riot (cada 24h)

Las keys de desarrollo de Riot **expiran cada 24 horas**. Cuando expira:

1. Entrá a https://developer.riotgames.com → **API Key (Development)** → Generate
2. En Vercel: **Settings → Environment Variables** → editá `RIOT_API_KEY` → Guardar
3. Vercel redeploya automáticamente. Listo.

También podés cambiarla desde la app: botón **"Cambiar API key"** en la barra superior
(el endpoint la valida contra Riot antes de guardarla).

> El badge de la app se pone **rojo** cuando la key pasa las 24h. Ese es el aviso.

## 3. Probar

- **Ranking**: https://tu-app.vercel.app → pestaña Ranking Squad
- **API key**: el badge arriba muestra el countdown; podés cambiarla desde el botón "Cambiar"
- **Customs**: registrá tu primer partido 5v5

## Estructura de tablas (Supabase)

| Tabla | Qué guarda |
|-------|-----------|
| `squad_members` | Miembros verificados de la squad |
| `custom_matches` | Partidas de la liga de customs + tabla |
| `riot_key` | La API key de Riot (1 sola fila) |

## Desarrollo local

- Sin `SUPABASE_URL` → usa archivos `data/*.json` (ya funciona).
- Con `SUPABASE_URL` → usa Supabase.
