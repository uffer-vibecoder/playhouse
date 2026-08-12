/**
 * Build the Water Sort archive.
 *
 *   node scripts/build-water.mjs [count]
 *
 * Deal at random, then prove it. That order was chosen from measurement rather
 * than taste: across 200 random deals at each of 6, 8, 10 and 12 colours, every
 * one was solvable with two spare tubes, and proving one costs a median of a
 * few hundred search steps. Building boards backwards from a solved state by
 * un-pouring would also guarantee solvability, but it produces tamer, more
 * samey deals — and there is no need for it when dealing works.
 *
 * `par` is the *shortest* solution, found breadth-first. A par that is merely
 * some solution would be worse than no par: it would call a good game careless.
 *
 * Append-only, like every archive here. Saves key off the puzzle id, so
 * renumbering would orphan every game in progress. New boards go on the end.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { DEPTH, SPARE, solve } from "../src/games/water/engine.ts";

const OUT = process.env.WS_OUT ?? "src/data/water.json";
const WANT = Number(process.argv[2] ?? 60);

/* mulberry32 — the same seeded PRNG the other generators use */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The ladder is the number of colours, and it is a clean one. Measured
 * shortest-solution lengths barely overlap between neighbours:
 *
 *     5 colours   median 15   (11–18)
 *     6 colours   median 18   (12–21)
 *     8 colours   median 25   (20–28)
 *    10 colours   median 31   (27–35)
 *
 * `floor` throws away the deals that fell out nearly sorted — at every colour
 * count a few land well under the median and would be a disappointment rather
 * than a puzzle.
 */
const TIERS = [
  { tier: "easy", colours: 5, floor: 14, share: 0.25 },
  { tier: "gentle", colours: 6, floor: 17, share: 0.25 },
  { tier: "steady", colours: 8, floor: 24, share: 0.25 },
  { tier: "tricky", colours: 10, floor: 30, share: 0.25 },
];

/** Shuffle every unit of colour into full tubes, then add the spares. */
function dealBoard(r, colours) {
  const units = [];
  for (let c = 0; c < colours; c++) for (let i = 0; i < DEPTH; i++) units.push(c);
  for (let i = units.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [units[i], units[j]] = [units[j], units[i]];
  }
  const tubes = [];
  for (let t = 0; t < colours; t++) tubes.push(units.slice(t * DEPTH, t * DEPTH + DEPTH));
  for (let s = 0; s < SPARE; s++) tubes.push([]);
  return tubes;
}

/** A deal that starts with a colour already finished is a freebie. */
const alreadyDone = (tubes) =>
  tubes.some((t) => t.length === DEPTH && t.every((v) => v === t[0]));

/* ── build ────────────────────────────────────────────────────────────────── */

const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : [];
const out = [...existing];
const startAt = out.length;

let seed = 20260728 + startAt * 7919;
let tried = 0, freebie = 0, tooEasy = 0, capped = 0, unsolvable = 0;
const pars = new Map();
const t0 = Date.now();

while (out.length - startAt < WANT && tried < WANT * 60) {
  tried++;
  const r = rng(seed++);

  const roll = r();
  let acc = 0;
  const tier = TIERS.find((t) => (acc += t.share) >= roll) ?? TIERS[1];

  const tubes = dealBoard(r, tier.colours);
  if (alreadyDone(tubes)) { freebie++; continue; }

  const path = solve(tubes, 600_000);
  if (path === "capped") { capped++; continue; }
  if (!path) { unsolvable++; continue; }
  if (path.length < tier.floor) { tooEasy++; continue; }

  const n = out.length + 1;
  out.push({
    id: `WS-${String(n).padStart(3, "0")}`,
    colours: tier.colours,
    tubes,
    par: path.length,
    tier: tier.tier,
  });
  if (!pars.has(tier.tier)) pars.set(tier.tier, []);
  pars.get(tier.tier).push(path.length);
}

writeFileSync(OUT, JSON.stringify(out, null, 0) + "\n");

const made = out.length - startAt;
const mean = (xs) => (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1);
console.log(`${made} new boards, ${out.length} in the archive (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
console.log(`  tried ${tried}: ${freebie} dealt a colour already done, ${tooEasy} too short, ${capped} over the search cap, ${unsolvable} unsolvable`);
for (const [tier, xs] of pars)
  console.log(`  ${tier.padEnd(7)} ${xs.length} boards, par ${Math.min(...xs)}–${Math.max(...xs)} (mean ${mean(xs)})`);

/* Re-prove everything about to ship, including boards written by an earlier
   run. A generator that only checks its own output cannot catch a change that
   quietly invalidated the file. */
let wrong = 0;
for (const p of out) {
  const again = solve(p.tubes, 800_000);
  if (again === "capped") { wrong++; console.error(`  ${p.id}: could not be re-proved`); continue; }
  if (!again) { wrong++; console.error(`  ${p.id}: cannot be solved at all`); continue; }
  if (again.length !== p.par) {
    wrong++;
    console.error(`  ${p.id}: par says ${p.par}, the search says ${again.length}`);
  }
}
console.log(wrong ? `  ✗ ${wrong} boards disagree with their par` : "  ✓ every board solved, and its par is the shortest way");
process.exitCode = wrong ? 1 : 0;
