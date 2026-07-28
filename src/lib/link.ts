"use client";

import { getSupabase, supabaseConfigured } from "./supabase/client";

/**
 * Linking two players, by mutual consent.
 *
 * One person generates a code and passes it on however they like; the other
 * enters it. Nobody is linked without doing something deliberate, and there is
 * no way to reach a stranger by guessing at an email address.
 *
 * The schema is what enforces that rather than this file: `links` has no insert
 * policy at all, so rows can only appear through `claim_link_invite`, which
 * runs as the definer and writes both directions at once. Everything here is a
 * thin caller — if it were bypassed entirely the guarantees would still hold.
 */

export type Link = { partner: string; since: string; name: string | null };

async function uid(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.user?.id ?? null;
}

/**
 * A code you can read out loud.
 *
 * Crockford's alphabet without I, L, O and U: the first three because they are
 * the ones misread as 1 and 0 when someone is copying a code off another
 * screen, and U because dropping it is what keeps the set from spelling things.
 *
 * Ten characters of it is about 48 bits. That is far more than two people need,
 * and it is deliberate: `claim_link_invite` gives one answer for expired,
 * already-claimed and never-existed alike, so a code cannot be probed — but the
 * only thing making guessing hopeless rather than merely slow is its length.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function freshCode(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  const raw = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
  // grouped for reading aloud; the dash is stripped again on the way in
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

export const tidyCode = (s: string) => s.trim().toUpperCase().replace(/[^0-9A-Z]/g, "");

/** Make an invite. Returns the code to pass on, or an error to show. */
export async function createInvite(): Promise<{ code: string } | { error: string }> {
  if (!supabaseConfigured) return { error: "Sign-in is not set up on this build." };
  const me = await uid();
  if (!me) return { error: "Sign in first." };

  const sb = getSupabase()!;
  const code = freshCode();
  const { error } = await sb.from("link_invites").insert({ code: tidyCode(code), inviter: me });
  if (error) return { error: error.message };
  return { code };
}

/**
 * Claim someone's invite.
 *
 * The database function does the work and the checks: it refuses an expired or
 * already-claimed code, refuses your own, and writes both directions of the
 * link in one transaction so there is no moment where one person can read the
 * other but not the reverse.
 */
export async function claimInvite(code: string): Promise<{ ok: true } | { error: string }> {
  if (!supabaseConfigured) return { error: "Sign-in is not set up on this build." };
  const me = await uid();
  if (!me) return { error: "Sign in first." };

  const sb = getSupabase()!;
  const { error } = await sb.rpc("claim_link_invite", { invite_code: tidyCode(code) });
  if (error) return { error: error.message };
  return { ok: true };
}

/** Who you are linked to, with their name if they have set one. */
export async function loadLink(): Promise<Link | null> {
  if (!supabaseConfigured) return null;
  const me = await uid();
  if (!me) return null;

  const sb = getSupabase()!;
  const { data, error } = await sb
    .from("links")
    .select("partner, created_at")
    .eq("owner", me)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;

  // A separate read, because the name lives in its own table with its own
  // policy — a partner may read it, and nothing else about the account.
  const { data: profile } = await sb
    .from("profiles")
    .select("display_name")
    .eq("user_id", data.partner)
    .maybeSingle();

  return {
    partner: data.partner as string,
    since: data.created_at as string,
    name: (profile?.display_name as string | null) ?? null,
  };
}

/**
 * Walk away. The trigger removes the other direction too, so nobody is left
 * able to read someone who believes they have unlinked.
 */
export async function unlink(): Promise<{ ok: true } | { error: string }> {
  const me = await uid();
  if (!me) return { error: "Sign in first." };
  const sb = getSupabase()!;
  const { error } = await sb.from("links").delete().eq("owner", me);
  if (error) return { error: error.message };
  return { ok: true };
}

/** An outstanding invite of your own, so the code survives a reload. */
export async function pendingInvite(): Promise<string | null> {
  if (!supabaseConfigured) return null;
  const me = await uid();
  if (!me) return null;
  const sb = getSupabase()!;
  const { data } = await sb
    .from("link_invites")
    .select("code, expires_at")
    .eq("inviter", me)
    .is("claimed_by", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.code as string) ?? null;
}
