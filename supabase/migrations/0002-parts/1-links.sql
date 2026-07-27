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
