#!/usr/bin/env node
/**
 * Builds src/data/solveforx.json.
 *
 *   node scripts/build-solveforx.mjs [count]
 *
 * A puzzle is one integer, because the ten problems are derived from it rather
 * than stored — see src/games/solveforx/engine.ts.
 *
 * The seed for puzzle n is a pure function of n, so this is append-only by
 * construction: raising the count adds entries and cannot disturb the ones
 * already there. That matters because saves are keyed by puzzle id, and
 * renumbering would orphan every set in progress.
 *
 * Knuth's multiplicative constant spreads consecutive indices across the whole
 * 32-bit range; feeding mulberry32 the raw 1, 2, 3... gives visibly similar
 * first problems between neighbouring puzzles.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The three tiers, in the order they were added.
 *
 * Easy stays at exactly 120 and its seeds are unchanged, because those sets
 * have shipped and are keyed by id. The two harder tiers append after them, so
 * a set's number never moves — the same rule every archive here follows.
 *
 * The tier is written onto the harder entries only. Absent means easy, which is
 * what the 120 already in the file say, and it is what the engine dispatches on.
 */
const TIERS = [
  { tier: undefined, count: 120 },
  { tier: "medium", count: 60 },
  { tier: "hard", count: 60 },
];

const added = new Date().toISOString().slice(0, 10);

const seedFor = (n) => Math.imul(n + 1, 2654435761) >>> 0;

const archive = [];
for (const { tier, count } of TIERS) {
  for (let i = 0; i < count; i++) {
    const n = archive.length;
    archive.push({
      id: `SX-${String(n + 1).padStart(3, "0")}`,
      seed: seedFor(n),
      ...(tier ? { tier } : {}),
      added,
    });
  }
}

const seeds = new Set(archive.map((p) => p.seed));
if (seeds.size !== archive.length) {
  console.error(`Seed collision: ${archive.length} puzzles but ${seeds.size} distinct seeds.`);
  process.exit(1);
}

writeFileSync(
  join(process.cwd(), "src/data/solveforx.json"),
  JSON.stringify(archive, null, 1) + "\n"
);
console.log(`Wrote ${archive.length} puzzles to src/data/solveforx.json`);
const byTier = archive.reduce((m, p) => ((m[p.tier ?? "easy"] = (m[p.tier ?? "easy"] ?? 0) + 1), m), {});
console.log("  " + Object.entries(byTier).map(([t, n]) => `${n} ${t}`).join(", "));
