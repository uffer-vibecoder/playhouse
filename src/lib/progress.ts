"use client";

import { getSupabase, supabaseConfigured } from "./supabase/client";
import { gameOf } from "./slot";

/* The slot grammar lives in ./slot — pure, and therefore testable on its own.
   Re-exported here because every game imports these from this module. */
export { fingerprint, gameOf, isFrom, puzzleOf, slotKey } from "./slot";

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

/**
 * Codeword's payload: which letter the player has assigned to each code.
 * Kept as the default so that game's call sites need no type argument.
 */
export type Entries = Record<number, string>;

/**
 * What a game needs to pick up where it left off.
 *
 * The payload is generic because games do not agree on its shape — codeword
 * stores code-to-letter, the word game stores a list of guesses — while
 * everything around it (the slot, the solved flag, last-write-wins on
 * `updatedAt`) is identical. The column is `jsonb`, so this costs no migration.
 */
export type SaveRecord<T = Entries> = {
  entries: T;
  solved: boolean;
  updatedAt: string;
};

/** Where a save actually landed, so the UI can stop claiming more than it did. */
export type SaveOutcome =
  | { where: "local" }
  | { where: "cloud" }
  | { where: "local"; error: string };

/**
 * Deliberately not the site's name. Saves outlive branding, and a key like
 * `playhouse:progress:` means renaming the site silently abandons every
 * half-finished puzzle already sitting in someone's browser. `LEGACY_PREFIX`
 * is the one we did ship under; `migrateLegacyKeys` carries those forward once.
 */
const LOCAL_PREFIX = "pz:progress:";
const LEGACY_PREFIX = "playhouse:progress:";

/**
 * Move any saves written under the old key across, once, on first load.
 *
 * Copy-then-remove rather than a rename: if the write throws on a full or
 * locked store, the original is still there to try again next time.
 */
function migrateLegacyKeys() {
  try {
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(LEGACY_PREFIX)) stale.push(k);
    }
    for (const k of stale) {
      const slot = k.slice(LEGACY_PREFIX.length);
      const raw = localStorage.getItem(k);
      if (raw && localStorage.getItem(LOCAL_PREFIX + slot) === null) {
        localStorage.setItem(LOCAL_PREFIX + slot, raw);
      }
      localStorage.removeItem(k);
    }
  } catch {
    /* private mode, or a full store — solving still works, it just will not persist */
  }
}

let migrated = false;
function ensureMigrated() {
  if (migrated || typeof localStorage === "undefined") return;
  migrated = true;
  migrateLegacyKeys();
}



/* ── local ──────────────────────────────────────────────────────────────── */

function readLocal<T>(slot: string): SaveRecord<T> | null {
  try {
    ensureMigrated();
    const raw = localStorage.getItem(LOCAL_PREFIX + slot);
    return raw ? (JSON.parse(raw) as SaveRecord<T>) : null;
  } catch {
    return null; // private mode — solving still works, it just will not persist
  }
}

function writeLocal<T>(slot: string, rec: SaveRecord<T>) {
  try {
    localStorage.setItem(LOCAL_PREFIX + slot, JSON.stringify(rec));
  } catch {
    /* ignore */
  }
}

/** Every local save, whatever game wrote it — so the payload stays opaque here. */
function allLocal(): { slot: string; rec: SaveRecord<unknown> }[] {
  const out: { slot: string; rec: SaveRecord<unknown> }[] = [];
  try {
    ensureMigrated();
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

/**
 * `getSession` reads the session locally; `getUser` round-trips to validate it.
 * Saves are debounced to every 400ms of typing, so a network call per save is
 * both slow and a way to lose writes when the network hiccups. The server
 * enforces the real check anyway — row-level security does not trust this id.
 */
async function currentUserId(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.user?.id ?? null;
}

/* ── public API ─────────────────────────────────────────────────────────── */

export async function loadProgress<T = Entries>(slot: string): Promise<SaveRecord<T> | null> {
  const local = readLocal<T>(slot);
  const uid = await currentUserId();
  if (!uid) return local;

  const sb = getSupabase()!;
  const { data, error } = await sb
    .from("game_progress")
    .select("entries, solved, updated_at")
    .eq("user_id", uid)
    .eq("slot", slot)
    .maybeSingle();

  if (error) console.error("[saves] cloud load failed:", error.message, error);
  if (error || !data) return local;
  const cloud: SaveRecord<T> = {
    entries: (data.entries ?? {}) as T,
    solved: Boolean(data.solved),
    updatedAt: data.updated_at as string,
  };
  // last write wins — simple, and right for a single player on two devices
  if (local && local.updatedAt > cloud.updatedAt) return local;
  return cloud;
}

export async function saveProgress<T = Entries>(
  slot: string,
  gameId: string,
  entries: T,
  solved: boolean
): Promise<SaveOutcome> {
  const rec: SaveRecord<T> = { entries, solved, updatedAt: new Date().toISOString() };
  writeLocal(slot, rec);

  const uid = await currentUserId();
  if (!uid) return { where: "local" };

  const sb = getSupabase()!;
  const { error } = await sb.from("game_progress").upsert(
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

  // Swallowing this is how "it doesn't seem to be saving" happens: the letters
  // are safe locally, so nothing looks broken until you open another device.
  if (error) {
    console.error("[saves] cloud save failed:", error.message, error);
    return { where: "local", error: error.message };
  }
  return { where: "cloud" };
}

/**
 * Carry anything solved while signed out up to the account.
 *
 * Called once after sign-in. Local wins only where the cloud has nothing —
 * signing in on a fresh device should not clobber real progress with an empty
 * local slate.
 */
export async function mergeLocalIntoCloud(): Promise<number> {
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
      // from the slot, never from the caller. This function uploads every local
      // save there is, not one game's, so a caller-supplied id was wrong for
      // all but one of them.
      game_id: gameOf(slot),
      entries: rec.entries,
      solved: rec.solved,
      updated_at: rec.updatedAt,
    }))
    .filter((r) => r.game_id !== "");

  if (!rows.length) return 0;
  const { error } = await sb.from("game_progress").upsert(rows, { onConflict: "user_id,slot" });
  if (error) {
    console.error("[saves] syncing local progress failed:", error.message, error);
    return 0;
  }
  return rows.length;
}

/**
 * Every save this player has for one game, keyed by slot.
 *
 * The picker only ever needs to know *which* puzzles are finished, but the
 * dashboard needs what is inside them — the guesses used, the answers scored —
 * so this returns the records themselves. The payload stays opaque here; each
 * game knows how to read its own.
 *
 * Local and cloud are merged with the same last-write-wins rule `loadProgress`
 * uses, so a player who has been on two devices sees one coherent record
 * rather than whichever store answered.
 */
export async function loadGameSaves<T = unknown>(
  gameId: string
): Promise<Map<string, SaveRecord<T>>> {
  const out = new Map<string, SaveRecord<T>>();
  for (const { slot, rec } of allLocal()) {
    if (slot.startsWith(gameId + ":")) out.set(slot, rec as SaveRecord<T>);
  }

  const uid = await currentUserId();
  if (!uid) return out;

  const sb = getSupabase()!;
  /* Matched on the slot rather than on `game_id`. The slot is authoritative and
     the column is a copy — and there are copies already in the cloud that were
     stamped with the wrong game. Reading by slot means those come back at once
     instead of staying invisible until the puzzle is next saved. */
  const { data, error } = await sb
    .from("game_progress")
    .select("slot, entries, solved, updated_at")
    .eq("user_id", uid)
    .like("slot", `${gameId}:%`);

  if (error) {
    console.error("[saves] reading the record failed:", error.message, error);
    return out;
  }

  for (const row of data ?? []) {
    const slot = row.slot as string;
    const cloud: SaveRecord<T> = {
      entries: (row.entries ?? {}) as T,
      solved: Boolean(row.solved),
      updatedAt: row.updated_at as string,
    };
    const local = out.get(slot);
    if (!local || cloud.updatedAt >= local.updatedAt) out.set(slot, cloud);
  }
  return out;
}

/**
 * Record that a puzzle was finished.
 *
 * A separate table from the saves, and the reason is the whole design: a save
 * holds the player's letters, which once solved is the answer, and row-level
 * security is row-level rather than column-level. Anything a partner is allowed
 * to read has to live somewhere that structurally cannot contain a solution.
 *
 * So `summary` carries facts about the attempt — guesses used, a score out of
 * ten — and never the entries. That invariant is written into the migration
 * too; this is the only code that writes the table, so this is where it holds.
 *
 * Insert-if-absent rather than upsert: `completed_at` should mean the first
 * time this was finished, and replaying a puzzle should not rewrite history.
 * Local play records nothing, because a result is a thing you compare with
 * someone and there is nobody to compare with until you sign in.
 */
export async function recordResult(
  slot: string,
  gameId: string,
  summary: Record<string, unknown> = {},
  elapsedMs: number | null = null
): Promise<void> {
  if (!supabaseConfigured) return;
  const uid = await currentUserId();
  if (!uid) return;

  const sb = getSupabase()!;
  const { error } = await sb.from("game_results").upsert(
    { user_id: uid, slot, game_id: gameId, elapsed_ms: elapsedMs, summary },
    { onConflict: "user_id,slot", ignoreDuplicates: true }
  );
  // Not surfaced in the UI: the puzzle is solved and the save already holds
  // that. A failure here costs a row in the record, not the player's work.
  if (error) console.error("[results] recording a finish failed:", error.message, error);
}

/** A finish, as the record table holds it. */
export type Result = {
  slot: string;
  gameId: string;
  completedAt: string;
  elapsedMs: number | null;
  summary: Record<string, unknown>;
};

/**
 * Every finish this player has recorded.
 *
 * `recordResult` has been writing `elapsed_ms` since the results migration
 * landed and nothing has ever read it back, so the record page has been saying
 * every solve was untimed no matter how many were timed. This is the read.
 *
 * Cloud only, and that is not an oversight: a result is the thing a partner is
 * allowed to see, and it only exists once you are signed in.
 */
export async function loadResults(gameId?: string): Promise<Result[]> {
  if (!supabaseConfigured) return [];
  const uid = await currentUserId();
  if (!uid) return [];

  const sb = getSupabase()!;
  let q = sb
    .from("game_results")
    .select("slot, game_id, completed_at, elapsed_ms, summary")
    .eq("user_id", uid);
  if (gameId) q = q.like("slot", `${gameId}:%`); // the slot, not the copy

  const { data, error } = await q;
  if (error) {
    console.error("[results] reading finishes failed:", error.message, error);
    return [];
  }
  return (data ?? []).map((r) => ({
    slot: r.slot as string,
    gameId: gameOf(r.slot as string),
    completedAt: r.completed_at as string,
    elapsedMs: typeof r.elapsed_ms === "number" ? r.elapsed_ms : null,
    summary: (r.summary ?? {}) as Record<string, unknown>,
  }));
}

/** Where a player left off: the most recently touched puzzle they have not finished. */
export type Bookmark = { slot: string; gameId: string; puzzleId: string; updatedAt: string };

/**
 * Games that are runs rather than archives.
 *
 * A run has nothing to finish, so its saves are never marked solved and every
 * one of them looks like something abandoned half-way. Left in, they take the
 * landing page's bookmark permanently: the hero read "Start back on your last
 * puzzle — Free-Atro No. 001-r1" and linked to `?p=run`, which no run game even
 * reads, while the codeword actually left half-done sat behind it.
 */
const RUNS = new Set(["blockout", "freeatro"]);

/**
 * The puzzle to offer to carry on with.
 *
 * Local only, deliberately. This is the answer to "what was I doing?", and the
 * honest answer is about *this* device — a puzzle half-solved on a phone is not
 * what someone sitting at a laptop means. It also keeps the landing page
 * instant rather than waiting on a round trip before it can render its hero.
 *
 * The slot is `<game>:<puzzle>:<fingerprint>`, so the id is the middle field;
 * splitting rather than storing it again keeps one source of truth.
 */
export function lastUnfinished(): Bookmark | null {
  let best: Bookmark | null = null;
  for (const { slot, rec } of allLocal()) {
    if (rec.solved) continue;
    const [gameId, puzzleId] = slot.split(":");
    if (!gameId || !puzzleId) continue;
    if (RUNS.has(gameId)) continue;
    if (!best || rec.updatedAt > best.updatedAt) {
      best = { slot, gameId, puzzleId, updatedAt: rec.updatedAt };
    }
  }
  return best;
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
    .like("slot", `${gameId}:%`) // the slot, not the copy — see loadGameSaves
    .eq("solved", true);

  for (const row of data ?? []) solved.add(row.slot as string);
  return solved;
}
