-- Playhouse — initial schema
--
-- Run this once against your Supabase project (SQL Editor → New query → paste
-- → Run). Everything the site needs to sync progress lives here.
--
-- Design notes:
--   * Playing is free and needs no account, so this table only ever holds the
--     progress of people who chose to sign in. Signed-out play stays in the
--     browser and is carried up on first sign-in.
--   * `slot` is "<game>:<puzzle>:<grid fingerprint>". The fingerprint matters:
--     puzzle ids are only unique within a pack, and two packs both numbering
--     from CW-001 would otherwise restore each other's letters onto different
--     grids.
--   * `game_id` is denormalised out of the slot so the picker can count
--     finished puzzles per game without parsing strings.

create table if not exists public.game_progress (
  user_id     uuid        not null references auth.users (id) on delete cascade,
  slot        text        not null,
  game_id     text        not null,
  entries     jsonb       not null default '{}'::jsonb,
  solved      boolean     not null default false,
  updated_at  timestamptz not null default now(),
  primary key (user_id, slot)
);

-- the picker's query: everything this player has finished in one game
create index if not exists game_progress_user_game_idx
  on public.game_progress (user_id, game_id)
  where solved;

alter table public.game_progress enable row level security;

-- A player may only ever see or touch their own saves. Four explicit policies
-- rather than one permissive `for all`, so a mistake in one verb cannot quietly
-- widen the others.
drop policy if exists "read own progress"   on public.game_progress;
drop policy if exists "insert own progress" on public.game_progress;
drop policy if exists "update own progress" on public.game_progress;
drop policy if exists "delete own progress" on public.game_progress;

create policy "read own progress"
  on public.game_progress for select
  using (auth.uid() = user_id);

create policy "insert own progress"
  on public.game_progress for insert
  with check (auth.uid() = user_id);

create policy "update own progress"
  on public.game_progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "delete own progress"
  on public.game_progress for delete
  using (auth.uid() = user_id);
