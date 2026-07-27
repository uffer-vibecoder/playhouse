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
