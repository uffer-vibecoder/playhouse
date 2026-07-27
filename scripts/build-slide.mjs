#!/usr/bin/env node
/**
 * Builds src/data/slide.json.
 *
 *   node scripts/build-slide.mjs [count]
 *
 * A puzzle is one integer, because the starting board is walked out from the
 * solved arrangement using that seed rather than stored — which is also what
 * guarantees it can be solved at all. See src/games/slide/engine.ts.
 *
 * The seed for puzzle n is a pure function of n, so this is append-only by
 * construction: raising the count adds entries and cannot disturb the ones
 * already there. That matters because saves are keyed by puzzle id, and
 * renumbering would orphan every board in progress.
 *
 * Knuth's multiplicative constant spreads consecutive indices across the whole
 * 32-bit range; feeding mulberry32 the raw 1, 2, 3... gives visibly similar
 * boards to neighbouring puzzles. The offset keeps this game's seeds clear of
 * Solve for x's, which derives its seeds the same way — the two are unrelated
 * and sharing numbers would only ever be a confusing coincidence.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const COUNT = Number(process.argv[2] ?? 120);
const added = new Date().toISOString().slice(0, 10);

const seedFor = (n) => Math.imul(n + 1 + 9973, 2654435761) >>> 0;

const archive = Array.from({ length: COUNT }, (_, i) => ({
  id: `SL-${String(i + 1).padStart(3, "0")}`,
  seed: seedFor(i),
  added,
}));

const seeds = new Set(archive.map((p) => p.seed));
if (seeds.size !== archive.length) {
  console.error(`Seed collision: ${archive.length} puzzles but ${seeds.size} distinct seeds.`);
  process.exit(1);
}

writeFileSync(
  join(process.cwd(), "src/data/slide.json"),
  JSON.stringify(archive, null, 1) + "\n"
);
console.log(`Wrote ${archive.length} puzzles to src/data/slide.json`);
console.log(`First seeds: ${archive.slice(0, 4).map((p) => p.seed).join(", ")}`);
