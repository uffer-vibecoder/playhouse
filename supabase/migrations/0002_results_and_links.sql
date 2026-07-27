-- Results, linking, and profiles
--
-- Run this once against your Supabase project: SQL Editor → New query → paste
-- the CONTENTS of this file → Run. It is safe to run more than once.
--
-- ── Why results are a separate table ────────────────────────────────────────
--
-- This is the load-bearing decision in the file, so it goes at the top.
--
-- `game_progress.entries` holds the player's letters — which is to say, once a
-- puzzle is solved, the answer. Postgres row-level security is row-level, not
-- column-level: any policy that let a partner read those rows would hand them
-- the answers to puzzles they have not played yet, and no amount of care in the
-- client would undo that.
--
-- So completion facts live in their own table, which structurally contains no
-- answer data at all. The leak becomes impossible rather than merely unlikely.
--
-- `game_progress` keeps its four existing policies untouched: own rows only,
-- always. Nothing below widens them.
--
-- ── Order of the file ───────────────────────────────────────────────────────
--
-- Linking comes first even though results are the point, because the policies
-- on results and profiles both read `public.links`. A policy cannot reference a
-- table that does not exist yet.

-- ═══ 1. who is linked to whom ═══════════════════════════════════════════════
--
-- One player generates a code and passes it on however they like; the other
-- enters it. Nobody is linked without doing something deliberate, and there is
-- no way to reach a stranger by guessing at an email address.

create table if not exists public.link_invites (
  code       text primary key,
  inviter    uuid        not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  claimed_by uuid        references auth.users (id) on delete set null
);

alter table public.link_invites enable row level security;

drop policy if exists "read own invites"   on public.link_invites;
drop policy if exists "create own invites" on public.link_invites;
drop policy if exists "delete own invites" on public.link_invites;

create policy "read own invites"
  on public.link_invites for select
  using (auth.uid() = inviter or auth.uid() = claimed_by);

create policy "create own invites"
  on public.link_invites for insert
  with check (auth.uid() = inviter);

create policy "delete own invites"
  on public.link_invites for delete
  using (auth.uid() = inviter);

-- Note there is deliberately no policy letting someone read an invite by its
-- code before claiming it. That would make codes enumerable: a short code is
-- guessable, and a policy that returns a row for every correct guess is an
-- oracle. Claiming goes through the function in section 2 instead, which runs
-- as the definer and returns nothing but success or failure.

create table if not exists public.links (
  owner      uuid        not null references auth.users (id) on delete cascade,
  partner    uuid        not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner, partner)
);

alter table public.links enable row level security;

drop policy if exists "read own links"   on public.links;
drop policy if exists "delete own links" on public.links;

create policy "read own links"
  on public.links for select
  using (auth.uid() = owner);

-- Either side can walk away, and it unlinks both directions — see the trigger.
create policy "delete own links"
  on public.links for delete
  using (auth.uid() = owner or auth.uid() = partner);

-- No insert policy at all. Rows only ever appear through claim_link_invite,
-- which is what makes "both people agreed" a property of the schema rather than
-- of the client.

-- ═══ 2. claiming and unclaiming ═════════════════════════════════════════════

-- Writes BOTH directions. Storing the pair twice makes every later read
-- `where owner = auth.uid()` — trivially indexable, and no `or` in a policy
-- that has to be right.
create or replace function public.claim_link_invite(invite_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  inviter_id uuid;
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;

  -- `for update` so two people racing the same code cannot both claim it
  select inviter into inviter_id
  from public.link_invites
  where code = invite_code
    and claimed_by is null
    and expires_at > now()
  for update;

  if inviter_id is null then
    -- One message for expired, already-claimed and never-existed alike.
    -- Telling them apart would tell someone holding a wrong code whether it was
    -- ever a real one.
    raise exception 'that code is not valid';
  end if;

  if inviter_id = auth.uid() then
    raise exception 'that is your own code';
  end if;

  update public.link_invites
     set claimed_by = auth.uid()
   where code = invite_code;

  insert into public.links (owner, partner)
  values (inviter_id, auth.uid()), (auth.uid(), inviter_id)
  on conflict do nothing;
end;
$$;

revoke all on function public.claim_link_invite(text) from public;
grant execute on function public.claim_link_invite(text) to authenticated;

-- Unlinking is mutual too: deleting one direction removes the other, so nobody
-- is left able to read a partner who believes they have unlinked. The mirror
-- delete fires this trigger again and finds nothing left to delete, which is
-- where it stops.
create or replace function public.unlink_both_ways()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.links
   where owner = old.partner and partner = old.owner;
  return old;
end;
$$;

drop trigger if exists links_unlink_both_ways on public.links;
create trigger links_unlink_both_ways
  after delete on public.links
  for each row execute function public.unlink_both_ways();

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

-- ═══ 4. who someone is ══════════════════════════════════════════════════════
--
-- The display name already works, stored in auth.users.user_metadata. That is
-- enough to show players their own name and no more: user_metadata is readable
-- only by its owner, so a partner would see a uuid.
--
-- One string, own-row write and linked-partner read, mirroring results above.

create table if not exists public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "read own profile"   on public.profiles;
drop policy if exists "insert own profile" on public.profiles;
drop policy if exists "update own profile" on public.profiles;
drop policy if exists "read a linked partner's profile" on public.profiles;

create policy "read own profile"
  on public.profiles for select
  using (auth.uid() = user_id);

create policy "insert own profile"
  on public.profiles for insert
  with check (auth.uid() = user_id);

create policy "update own profile"
  on public.profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "read a linked partner's profile"
  on public.profiles for select
  using (exists (
    select 1 from public.links
    where links.owner = auth.uid()
      and links.partner = profiles.user_id
  ));
