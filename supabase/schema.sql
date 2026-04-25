create extension if not exists pgcrypto;

create table if not exists public.user_teams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id integer not null,
  team_name text not null,
  league_id integer not null,
  created_at timestamptz not null default now(),
  unique (user_id, team_id)
);

create index if not exists idx_user_teams_user_id
  on public.user_teams (user_id);

create index if not exists idx_user_teams_league_id
  on public.user_teams (league_id);

alter table public.user_teams enable row level security;

create policy "Users can read their own pinned teams"
  on public.user_teams
  for select
  using (auth.uid() = user_id);

create policy "Users can insert their own pinned teams"
  on public.user_teams
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own pinned teams"
  on public.user_teams
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own pinned teams"
  on public.user_teams
  for delete
  using (auth.uid() = user_id);

create table if not exists public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  league_ids integer[] not null,
  updated_at timestamptz not null default now(),
  check (coalesce(array_length(league_ids, 1), 0) > 0)
);

create index if not exists idx_user_preferences_user_id
  on public.user_preferences (user_id);

alter table public.user_preferences enable row level security;

create policy "Users can read their own preferences"
  on public.user_preferences
  for select
  using (auth.uid() = user_id);

create policy "Users can insert their own preferences"
  on public.user_preferences
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own preferences"
  on public.user_preferences
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own preferences"
  on public.user_preferences
  for delete
  using (auth.uid() = user_id);
