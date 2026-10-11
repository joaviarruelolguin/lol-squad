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

-- Historial de chats con la IA (FIFO: máx 10 chats por usuario)
create table if not exists public.ai_chats (
  id text primary key,
  user_id text default 'squad', -- por ahora un solo grupo
  title text,
  messages jsonb not null default '[]',
  match_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Trigger para actualizar updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_ai_chats_updated_at on public.ai_chats;
create trigger trg_ai_chats_updated_at
  before update on public.ai_chats
  for each row execute function update_updated_at();

-- Función para mantener solo los 10 chats más recientes (FIFO)
create or replace function enforce_chat_limit()
returns trigger as $$
begin
  delete from public.ai_chats
  where user_id = new.user_id
    and created_at < (
      select created_at from public.ai_chats
      where user_id = new.user_id
      order by created_at desc
      offset 9 limit 1
    );
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_chat_limit on public.ai_chats;
create trigger trg_chat_limit
  after insert on public.ai_chats
  for each row execute function enforce_chat_limit();

-- Resúmenes semanales generados por IA
create table if not exists public.weekly_summaries (
  id text primary key,
  week_start timestamptz not null,
  week_end timestamptz not null,
  matches_analyzed int default 0,
  squad_winrate int default 0,
  highlights text,
  improvements jsonb,
  model text,
  created_at timestamptz default now()
);

-- (Opcional) RLS: dejamos las tablas accesibles desde el servidor.
-- Como usamos la service role key en el backend, no hace falta habilitar RLS.
