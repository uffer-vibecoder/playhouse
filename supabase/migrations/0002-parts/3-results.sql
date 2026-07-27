-- ═══ 3. what was finished ═══════════════════════════════════════════════════

create table if not exists public.game_results (
  user_id      uuid        not null references auth.users (id) on delete cascade,
  slot         text        not null,
  game_id      text        not null,
  completed_at timestamptz not null default now(),
  -- Null unless the player chose to run the timer. Timing is opt-in and never
  -- auto-starts, so null is the ordinary case rather than a missing value —
  -- every reader shows it as an em dash, never as a zero.
  elapsed_ms   integer,
  -- INVARIANT: never the answer, never the entries. Guesses used, the share
  -- grid, a score out of ten — facts about the attempt, which is exactly what a
  -- linked partner may see. Anything that would let someone reconstruct the
  -- solution belongs in game_progress instead.
  summary      jsonb       not null default '{}'::jsonb,
  primary key (user_id, slot)
);

-- the record's query, and the "lately" feed: this player's finishes, newest first
create index if not exists game_results_user_done_idx
  on public.game_results (user_id, completed_at desc);

alter table public.game_results enable row level security;

drop policy if exists "read own results"   on public.game_results;
drop policy if exists "insert own results" on public.game_results;
drop policy if exists "update own results" on public.game_results;
drop policy if exists "delete own results" on public.game_results;
drop policy if exists "read a linked partner's results" on public.game_results;

create policy "read own results"
  on public.game_results for select
  using (auth.uid() = user_id);

create policy "insert own results"
  on public.game_results for insert
  with check (auth.uid() = user_id);

create policy "update own results"
  on public.game_results for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "delete own results"
  on public.game_results for delete
  using (auth.uid() = user_id);

-- Select only. No insert, update or delete widening, so a link can never become
-- a way to write to someone else's record. And a row only exists once a puzzle
-- is finished, so this is not a way to watch a partner mid-solve either.
create policy "read a linked partner's results"
  on public.game_results for select
  using (exists (
    select 1 from public.links
    where links.owner = auth.uid()
      and links.partner = game_results.user_id
  ));
