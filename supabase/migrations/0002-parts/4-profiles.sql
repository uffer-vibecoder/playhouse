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
