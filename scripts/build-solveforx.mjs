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

const COUNT = Number(process.argv[2] ?? 120);
const added = new Date().toISOString().slice(0, 10);

const seedFor = (n) => Math.imul(n + 1, 2654435761) >>> 0;

const archive = Array.from({ length: COUNT }, (_, i) => ({
  id: `SX-${String(i + 1).padStart(3, "0")}`,
  seed: seedFor(i),
  added,
}));

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
console.log(`First seeds: ${archive.slice(0, 4).map((p) => p.seed).join(", ")}`);
