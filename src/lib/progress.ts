"use client";

import { getSupabase, supabaseConfigured } from "./supabase/client";

/**
 * Where a half-solved puzzle lives.
 *
 * Signed out, progress is a localStorage entry — that is the whole point of
 * "play free": no account, no round trip, works offline. Signed in, the same
 * shape goes to Postgres so it follows you between devices, and whatever was
 * saved locally is carried up on first sign-in rather than being lost.
 *
 * The storage key carries a fingerprint of the grid as well as the puzzle id,
 * because ids are only unique within a pack: two packs both numbering from
 * CW-001 would otherwise restore each other's letters onto different grids.
 */

export type Entries = Record<number, string>;

export type SaveRecord = {
  entries: Entries;
  solved: boolean;
  updatedAt: string;
};

const LOCAL_PREFIX = "playhouse:progress:";

export function fingerprint(grid: number[][], key: string): string {
  let h = 2166136261;
  const s = grid.flat().join(",") + "|" + key;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export const slotKey = (gameId: string, puzzleId: string, fp: string) =>
  `${gameId}:${puzzleId}:${fp}`;

/* ── local ──────────────────────────────────────────────────────────────── */

function readLocal(slot: string): SaveRecord | null {
  try {
    const raw = localStorage.getItem(LOCAL_PREFIX + slot);
    return raw ? (JSON.parse(raw) as SaveRecord) : null;
  } catch {
    return null; // private mode — solving still works, it just will not persist
  }
}

function writeLocal(slot: string, rec: SaveRecord) {
  try {
    localStorage.setItem(LOCAL_PREFIX + slot, JSON.stringify(rec));
  } catch {
    /* ignore */
  }
}

function allLocal(): { slot: string; rec: SaveRecord }[] {
  const out: { slot: string; rec: SaveRecord }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(LOCAL_PREFIX)) continue;
      const rec = readLocal(k.slice(LOCAL_PREFIX.length));
      if (rec) out.push({ slot: k.slice(LOCAL_PREFIX.length), rec });
    }
  } catch {
    /* ignore */
  }
  return out;
}

/* ── cloud ──────────────────────────────────────────────────────────────── */

async function currentUserId(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user?.id ?? null;
}

/* ── public API ─────────────────────────────────────────────────────────── */

export async function loadProgress(slot: string): Promise<SaveRecord | null> {
  const local = readLocal(slot);
  const uid = await currentUserId();
  if (!uid) return local;

  const sb = getSupabase()!;
  const { data, error } = await sb
    .from("game_progress")
    .select("entries, solved, updated_at")
    .eq("user_id", uid)
    .eq("slot", slot)
    .maybeSingle();

  if (error || !data) return local;
  const cloud: SaveRecord = {
    entries: (data.entries ?? {}) as Entries,
    solved: Boolean(data.solved),
    updatedAt: data.updated_at as string,
  };
  // last write wins — simple, and right for a single player on two devices
  if (local && local.updatedAt > cloud.updatedAt) return local;
  return cloud;
}

export async function saveProgress(
  slot: string,
  gameId: string,
  entries: Entries,
  solved: boolean
): Promise<void> {
  const rec: SaveRecord = { entries, solved, updatedAt: new Date().toISOString() };
  writeLocal(slot, rec);

  const uid = await currentUserId();
  if (!uid) return;

  const sb = getSupabase()!;
  await sb.from("game_progress").upsert(
    {
      user_id: uid,
      slot,
      game_id: gameId,
      entries,
      solved,
      updated_at: rec.updatedAt,
    },
    { onConflict: "user_id,slot" }
  );
}

/**
 * Carry anything solved while signed out up to the account.
 *
 * Called once after sign-in. Local wins only where the cloud has nothing —
 * signing in on a fresh device should not clobber real progress with an empty
 * local slate.
 */
export async function mergeLocalIntoCloud(gameId: string): Promise<number> {
  if (!supabaseConfigured) return 0;
  const uid = await currentUserId();
  if (!uid) return 0;

  const local = allLocal();
  if (!local.length) return 0;

  const sb = getSupabase()!;
  const { data: existing } = await sb
    .from("game_progress")
    .select("slot, updated_at")
    .eq("user_id", uid);

  const cloudAt = new Map((existing ?? []).map((r) => [r.slot as string, r.updated_at as string]));
  const rows = local
    .filter(({ slot, rec }) => {
      const there = cloudAt.get(slot);
      return !there || rec.updatedAt > there;
    })
    .map(({ slot, rec }) => ({
      user_id: uid,
      slot,
      game_id: gameId,
      entries: rec.entries,
      solved: rec.solved,
      updated_at: rec.updatedAt,
    }));

  if (!rows.length) return 0;
  await sb.from("game_progress").upsert(rows, { onConflict: "user_id,slot" });
  return rows.length;
}

/** Which puzzles are finished, for the picker. */
export async function loadSolvedSet(gameId: string): Promise<Set<string>> {
  const solved = new Set<string>();
  for (const { slot, rec } of allLocal()) {
    if (rec.solved && slot.startsWith(gameId + ":")) solved.add(slot);
  }

  const uid = await currentUserId();
  if (!uid) return solved;

  const sb = getSupabase()!;
  const { data } = await sb
    .from("game_progress")
    .select("slot")
    .eq("user_id", uid)
    .eq("game_id", gameId)
    .eq("solved", true);

  for (const row of data ?? []) solved.add(row.slot as string);
  return solved;
}
