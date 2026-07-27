/**
 * The dashboard's numbers, built from the saves we already keep.
 *
 * Pure: it takes archives and saved records and returns the payload design's
 * contract describes. No storage, no fetch, no DOM — the page does the reading
 * and hands the results here, so this is testable against made-up saves.
 *
 * WHAT IS MISSING, AND WHY THAT IS NOT A BUG
 *
 * Nothing here carries a time. Timing is opt-in and never auto-starts, so most
 * completions genuinely have none, and the contract's first rule is that a null
 * time renders as an em dash at full legibility — never greyed, never omitted,
 * never zero. Until the results migration lands, *every* time is null, which is
 * a sparse record rather than a broken one.
 *
 * `lately` is absent for a different reason: it is ordered by completion and we
 * store only `updatedAt`, which moves whenever a puzzle is touched. Ordering by
 * it would misreport the sequence, so the section is left out rather than
 * approximated.
 */

export type Shape = "archive" | "distribution" | "scoreRows" | "draft";

export type SetProgress = { name: string; done: number; of: number };

export type GameRecord = {
  id: string;
  num: string;
  name: string;
  shape: Shape;
  note: string;
  archive?: { total: number; done: number };
  sets?: SetProgress[];
  /** Counts for guesses 1..6. Always length 6, zeros included. */
  distribution?: number[];
  solved?: number;
  failed?: number;
  average?: number | null;
  outOf?: number;
  recent?: { label: string; score: number }[];
};

export type PlayerRecord = {
  finished: number;
  timedCount: number;
  timedAverage: string | null;
  untimedCount: number;
};

/* ── codeword ───────────────────────────────────────────────────────────── */

export function codewordRecord(
  num: string,
  puzzles: { id: string; theme?: string }[],
  solvedSlots: Set<string>,
  slotOf: (p: { id: string }) => string
): GameRecord {
  const done = puzzles.filter((p) => solvedSlots.has(slotOf(p))).length;

  const themes = new Map<string, { done: number; of: number }>();
  for (const p of puzzles) {
    if (!p.theme) continue;
    const t = themes.get(p.theme) ?? { done: 0, of: 0 };
    t.of++;
    if (solvedSlots.has(slotOf(p))) t.done++;
    themes.set(p.theme, t);
  }

  return {
    id: "codeword",
    num,
    name: "Codeword",
    shape: "archive",
    // No score exists for this game and none is invented. Finished or not.
    note: `Finished or not — no score exists. ${done} of ${puzzles.length}.`,
    archive: { total: puzzles.length, done },
    sets: [...themes].map(([name, t]) => ({ name, done: t.done, of: t.of })),
  };
}

/* ── word guessing ──────────────────────────────────────────────────────── */

/**
 * The distribution is **always** six buckets, zeros included: the shape of it is
 * the point, so an absent bucket is a 0 rather than a missing bar.
 *
 * A failure is a save with every try used and no solve. They stay failed — the
 * archive never quietly retries one — so they are counted apart from the
 * distribution rather than folded into it.
 */
export function wordRecord(
  num: string,
  saves: Map<string, { entries: { guesses?: string[] }; solved: boolean }>,
  tries: number
): GameRecord {
  const distribution = Array(6).fill(0) as number[];
  let solved = 0;
  let failed = 0;

  for (const rec of saves.values()) {
    const used = rec.entries?.guesses?.length ?? 0;
    if (rec.solved) {
      solved++;
      if (used >= 1 && used <= 6) distribution[used - 1]++;
    } else if (used >= tries) {
      failed++;
    }
  }

  const best = distribution.findIndex((n) => n > 0);
  return {
    id: "wordgame",
    num,
    name: "Word Guessing",
    shape: "distribution",
    note:
      solved || failed
        ? `${solved} solved, ${failed} failed and left failed.` +
          (best >= 0 ? ` Best: ${best + 1} ${best === 0 ? "guess" : "guesses"}.` : "")
        : "Nothing finished yet.",
    distribution,
    solved,
    failed,
  };
}

/* ── solve for x ────────────────────────────────────────────────────────── */

/**
 * Averages the **first** attempt at each set, which is why the save carries
 * `firstScore` — replaying overwrites the answers, so a later read cannot
 * recover what the first attempt scored. Sets with no recorded first attempt
 * are left out of the average rather than counted as zero.
 */
export function solveRecord(
  num: string,
  puzzles: { id: string }[],
  saves: Map<string, { entries: { firstScore?: number } }>,
  slotOf: (p: { id: string }) => string,
  outOf: number
): GameRecord {
  const scored: { label: string; score: number }[] = [];
  for (const p of puzzles) {
    const first = saves.get(slotOf(p))?.entries?.firstScore;
    if (typeof first === "number") {
      scored.push({ label: p.id.replace("SX-", "Set "), score: first });
    }
  }

  const average = scored.length
    ? Math.round((scored.reduce((a, s) => a + s.score, 0) / scored.length) * 10) / 10
    : null;

  return {
    id: "solveforx",
    num,
    name: "Solve for X",
    shape: "scoreRows",
    note: scored.length
      ? `${scored.length} ${scored.length === 1 ? "set" : "sets"}. Redoable; the first attempt is the one averaged.`
      : "Nothing finished yet.",
    average,
    outOf,
    // newest first, as the contract specifies
    recent: scored.slice(-5).reverse(),
  };
}

/* ── a game with nothing to say yet ─────────────────────────────────────── */

export const simpleRecord = (
  id: string,
  num: string,
  name: string,
  puzzles: { id: string }[],
  solvedSlots: Set<string>,
  slotOf: (p: { id: string }) => string
): GameRecord => {
  const done = puzzles.filter((p) => solvedSlots.has(slotOf(p))).length;
  return {
    id,
    num,
    name,
    shape: "archive",
    note: `Finished or not. ${done} of ${puzzles.length}.`,
    archive: { total: puzzles.length, done },
  };
};

export const draftRecord = (id: string, num: string, name: string, note: string): GameRecord => ({
  id,
  num,
  name,
  shape: "draft",
  note,
});

/* ── the player ─────────────────────────────────────────────────────────── */

/**
 * `timedAverage` is the average of *timed* solves only, and its label has to
 * say so. Averaging across untimed rows by treating them as zero would be
 * arithmetic on data that does not exist.
 */
export function playerRecord(finished: number, times: number[]): PlayerRecord {
  const timedCount = times.length;
  const timedAverage =
    timedCount === 0
      ? null
      : (() => {
          const ms = times.reduce((a, b) => a + b, 0) / timedCount;
          const total = Math.round(ms / 1000);
          return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
        })();
  return { finished, timedCount, timedAverage, untimedCount: finished - timedCount };
}
