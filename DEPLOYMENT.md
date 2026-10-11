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
   - `RIOT_API_KEY`
   - `RIOT_REGION` = americas
   - `RIOT_ROUTING` = la2
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL` = gemini-3.8-flash
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Deploy.

> En Vercel NO se puede escribir al filesystem, por eso la API key de Riot se guarda
> en Supabase (tabla `riot_key`) y el badge de countdown la lee de ahí.

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
