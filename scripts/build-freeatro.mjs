/**
 * Build the Free-Atro deals.
 *
 *   node scripts/build-freeatro.mjs [count]
 *
 * Every deal that ships has been **won before it shipped**. The builder deals
 * from a seed, runs the engine's solver, and keeps the deal only if a win comes
 * back. Freecell is famously almost always solvable — which is exactly why the
 * check is worth doing rather than assuming: the whole point is that the one
 * deal in a few thousand that strands someone never reaches the archive.
 *
 * The route length it records is *a* solution, not the shortest. The search is
 * greedy best-first, so it finds a way home quickly rather than the best way,
 * and the file says `route` instead of `par` so nobody later mistakes it for a
 * number to be beaten.
 *
 * Append-only, like every archive here: saves key off the deal id.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { ROUND_RANKS, deal, solve } from "../src/games/freeatro/engine.ts";

const OUT = "src/data/freeatro.json";
const WANT = Number(process.argv[2] ?? 60);

/*
 * Rounds are short decks — ace to eight, thirty-two cards — because a round has
 * to be about five minutes for a run of them to make sense. The targets live in
 * the engine and climb per round; nothing about them belongs in a deal.
 */

const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : [];
const out = [...existing];
const startAt = out.length;

let tried = 0;
let unproved = 0;
const routes = [];
let slowest = 0;

while (out.length - startAt < WANT && tried < WANT * 6) {
  const n = out.length;
  const seed = Math.imul(n + 1 + tried * 7919, 2654435761) >>> 0;
  tried++;

  const t0 = Date.now();
  const route = solve(deal(seed, ROUND_RANKS), 250_000);
  const ms = Date.now() - t0;
  slowest = Math.max(slowest, ms);

  if (route === null) {
    unproved++;
    continue;
  }
  routes.push(route);
  out.push({
    id: `FA-${String(n + 1).padStart(3, "0")}`,
    seed,
    ranks: ROUND_RANKS,
    route,
  });
}

writeFileSync(OUT, JSON.stringify(out, null, 0) + "\n");

const made = out.length - startAt;
console.log(`${made} new deals, ${out.length} in the archive`);
console.log(`  tried ${tried}, discarded ${unproved} the solver could not win`);
console.log(
  `  routes ${Math.min(...routes)}–${Math.max(...routes)} moves, slowest search ${slowest}ms`
);

/* Re-prove everything about to ship, including deals from an earlier run: a
   builder that only checks its own output cannot catch a rule change that
   quietly invalidated the file. */
let broken = 0;
for (const d of out) {
  if (solve(deal(d.seed, d.ranks), 400_000) === null) {
    broken++;
    console.error(`  ${d.id}: no longer winnable`);
  }
}
console.log(broken ? `  ✗ ${broken} deals no longer win` : "  ✓ every deal re-proved");
process.exitCode = broken ? 1 : 0;
