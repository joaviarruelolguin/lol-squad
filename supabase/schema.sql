-- ============================================================
-- Esquema de Squad LoL Dashboard para Supabase (PostgreSQL)
-- ============================================================
-- Cómo aplicarlo:
--   1. Entrá a tu proyecto en supabase.com
--   2. Menú lateral → SQL Editor → New query
--   3. Pegá todo este script y clic "Run"
-- ============================================================

-- Miembros de la squad
create table if not exists public.squad_members (
  id text primary key,              -- suele ser el PUUID
  game_name text not null,
  tag_line text not null,
  nickname text,
  role text default 'FILL',
  puuid text,
  profile_icon_id int default 29,
  summoner_level int default 100,
  region text default 'la2',
  added_at timestamptz default now()
);

-- Partidas de la liga de customs
create table if not exists public.custom_matches (
  id text primary key,
  date timestamptz default now(),
  team_a_name text not null,
  team_b_name text not null,
  team_a text[] default '{}',       -- ids de miembros
  team_b text[] default '{}',
  score_a int,
  score_b int,
  winner text,                      -- 'A' | 'B'
  mvp_member_id text,
  notes text
);

-- API Key de Riot (una sola fila, id = 1)
create table if not exists public.riot_key (
  id int primary key default 1,
  api_key text not null,
  set_at timestamptz default now()
);

-- (Opcional) RLS: dejamos las tablas accesibles desde el servidor.
-- Como usamos la service role key en el backend, no hace falta habilitar RLS.
