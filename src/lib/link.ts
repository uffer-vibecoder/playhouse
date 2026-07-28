"use client";

import { getSupabase, supabaseConfigured } from "./supabase/client";
import { gameOf } from "./progress";

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

/* ── seeing what they have done ───────────────────────────────────────────── */

export type PartnerFinish = { gameId: string; slot: string; at: string; summary: Record<string, unknown> };

/**
 * A linked partner's finished puzzles.
 *
 * Finished, and only finished — a `game_results` row exists solely once a
 * puzzle is done, so there is structurally no way to watch someone mid-solve.
 * That is the design rather than a limitation, and it is worth saying out loud
 * because "their progress" naturally sounds like it should include how far
 * along they are on something. It does not, and cannot.
 */
export async function loadPartnerFinishes(partner: string): Promise<PartnerFinish[]> {
  if (!supabaseConfigured) return [];
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("game_results")
    .select("game_id, slot, completed_at, summary")
    .eq("user_id", partner)
    .order("completed_at", { ascending: false });
  if (error) {
    console.error("[link] reading a partner's record failed:", error.message, error);
    return [];
  }
  return (data ?? []).map((r) => ({
    gameId: r.game_id as string,
    slot: r.slot as string,
    at: r.completed_at as string,
    summary: (r.summary ?? {}) as Record<string, unknown>,
  }));
}

/**
 * Write result rows for puzzles finished before results existed.
 *
 * `recordResult` only started writing on the day the results table shipped, so
 * everything either of us had already finished has a solved save and no result
 * — which is most of the archive, and it would make a freshly linked partner
 * look like they had never played. The saves know what was finished and when it
 * was last touched, so the history can be reconstructed.
 *
 * `updated_at` is not really a completion time: it moves whenever a puzzle is
 * touched. It is the closest thing that exists, and using it is better than
 * discarding the finish entirely — but it is why `summary` is left empty here
 * rather than invented, and why this only ever fills gaps. Insert-if-absent, so
 * a real recorded finish is never overwritten by this guess.
 */
export async function backfillResults(): Promise<number> {
  if (!supabaseConfigured) return 0;
  const me = await uid();
  if (!me) return 0;
  const sb = getSupabase()!;

  const { data: solved } = await sb
    .from("game_progress")
    .select("slot, updated_at")
    .eq("user_id", me)
    .eq("solved", true);
  if (!solved?.length) return 0;

  const { data: have } = await sb.from("game_results").select("slot").eq("user_id", me);
  const already = new Set((have ?? []).map((r) => r.slot as string));

  const rows = solved
    .filter((r) => !already.has(r.slot as string))
    .map((r) => ({
      user_id: me,
      slot: r.slot as string,
      // derived, not copied: game_progress.game_id has wrong values in it from
      // the merge bug, and copying them here spread the mistake to the record
      game_id: gameOf(r.slot as string),
      completed_at: r.updated_at as string,
      elapsed_ms: null,
      summary: {},
    }));
  if (!rows.length) return 0;

  const { error } = await sb
    .from("game_results")
    .upsert(rows, { onConflict: "user_id,slot", ignoreDuplicates: true });
  if (error) {
    console.error("[link] backfilling the record failed:", error.message, error);
    return 0;
  }
  return rows.length;
}
