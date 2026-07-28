/**
 * Build the Colour Blocks archive.
 *
 *   node scripts/build-blocks.mjs [count]
 *
 * One block is trying to get out; the rest are in the way. Every board that
 * ships has been **solved before it shipped**. The generator
 * places blocks and gates at random, runs the engine's breadth-first search,
 * and keeps the board only if the search comes back with a shortest solution
 * inside the difficulty band. A board that cannot be finished, or one that
 * falls out in two moves, never reaches the file.
 *
 * That is the whole point of the exercise: this is the one game here with many
 * solutions rather than one, so the promise changes from "there is exactly one
 * answer" to "the shortest answer is exactly par". A promise like that is only
 * worth making if it is checked, and this is where it gets checked.
 *
 * Append-only, like every other archive. Saves key off the puzzle id, so
 * renumbering would orphan every game in progress. New boards go on the end.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { solve } from "../src/games/blocks/engine.ts";

const OUT = "src/data/blocks.json";
const WANT = Number(process.argv[2] ?? 60);

/* ── the shape of a board ─────────────────────────────────────────────────── */

/**
 * Three sizes, and the band each one aims at.
 *
 * `cap` is the search's ceiling. It is generous rather than tight because the
 * cost of stopping early is a board thrown away, and the cost of a board that
 * hangs the generator is worse.
 */
const TIERS = [
  { w: 4, h: 4, blocks: [4, 5], par: [6, 12], cap: 120_000, share: 0.25 },
  { w: 5, h: 5, blocks: [5, 7], par: [8, 16], cap: 300_000, share: 0.4 },
  { w: 6, h: 6, blocks: [5, 7], par: [10, 22], cap: 400_000, share: 0.35 },
];

/*
 * The bands lifted once the rule became a single escape. Getting one block out
 * is a much smaller ask than clearing every block, and the first run under the
 * new rule threw away 584 boards of 801 as too easy while still landing 23 of
 * its 60 at the very bottom of the range. More obstacles and a higher floor.
 */

/*
 * The first run of this had 5–8 blocks on the 6×6 board and produced none at
 * all: every attempt hit the search cap, so the whole archive came out 4×4 and
 * 5×5 with a par that never passed 9.
 *
 * The fix is fewer blocks rather than a bigger cap. Positions grow roughly like
 * (free cells choose blocks), so on 36 cells the difference between five blocks
 * and eight is the difference between a search that finishes and one that does
 * not. A big board with a few pieces on it is also a different puzzle from a
 * small crowded one — more room to manoeuvre, longer routes — which is the
 * variety the tier was there to provide.
 */

/* mulberry32 — the same seeded PRNG the other generators use, so a run is
   reproducible and a bad board can be looked at again */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
const between = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));

/** Rectangles worth having: singles, dominoes, and the occasional long one. */
const SHAPES = [
  [1, 1], [1, 1], [1, 1],
  [2, 1], [1, 2],
  [2, 1], [1, 2],
  [3, 1], [1, 3],
];

function tryBoard(r, tier) {
  const { w, h } = tier;
  const want = between(r, tier.blocks[0], tier.blocks[1]);
  const grid = Array.from({ length: h }, () => Array(w).fill(false));
  const blocks = [];

  /* The hero first, so it is never squeezed into whatever gap is left. It is
     placed away from its own wall — a block that starts in the doorway is not a
     puzzle. */
  const edge = pick(r, ["top", "bottom", "left", "right"]);
  const [hw, hh] = pick(r, [[1, 1], [2, 1], [1, 2]]);
  const hx = between(r, 0, w - hw);
  const hy = between(r, 0, h - hh);
  for (let j = hy; j < hy + hh; j++) for (let i = hx; i < hx + hw; i++) grid[j][i] = true;
  blocks.push({ id: 0, x: hx, y: hy, w: hw, h: hh, hero: true });

  // the way out, wide enough for the hero and lined up somewhere it could reach
  const along = edge === "top" || edge === "bottom" ? w : h;
  const span = edge === "top" || edge === "bottom" ? hw : hh;
  const gate = { edge, at: between(r, 0, along - span), len: span };

  // and it must not start already at the door
  const atDoor =
    (edge === "top" && hy === 0) || (edge === "bottom" && hy + hh === h) ||
    (edge === "left" && hx === 0) || (edge === "right" && hx + hw === w);
  if (atDoor) return null;

  for (let attempt = 0; attempt < 200 && blocks.length < want; attempt++) {
    const [bw, bh] = pick(r, SHAPES);
    if (bw > w || bh > h) continue;
    const x = between(r, 0, w - bw);
    const y = between(r, 0, h - bh);

    let free = true;
    for (let j = y; j < y + bh && free; j++)
      for (let i = x; i < x + bw && free; i++) if (grid[j][i]) free = false;
    if (!free) continue;

    for (let j = y; j < y + bh; j++) for (let i = x; i < x + bw; i++) grid[j][i] = true;
    blocks.push({ id: blocks.length, x, y, w: bw, h: bh });
  }
  if (blocks.length < tier.blocks[0]) return null;

  return { w, h, blocks, gate, par: 0 };
}

/* ── build ────────────────────────────────────────────────────────────────── */

const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : [];
const out = [...existing];
const startAt = out.length;

let seed = 20260727 + startAt * 7919;
let tried = 0;
let unsolvable = 0;
let tooEasy = 0;
let tooHard = 0;
let capped = 0;
const parCount = new Map();

while (out.length - startAt < WANT && tried < WANT * 400) {
  tried++;
  const r = rng(seed++);
  // keep the mix roughly to the shares above
  const roll = r();
  let acc = 0;
  const tier = TIERS.find((t) => (acc += t.share) >= roll) ?? TIERS[1];

  const board = tryBoard(r, tier);
  if (!board) continue;

  const par = solve({ id: "probe", ...board }, tier.cap);
  if (par === null) {
    // null is both "no solution" and "gave up" — they are different failures
    // and the counters keep them apart so the tuning is honest
    if (board.blocks.length >= 7) capped++;
    else unsolvable++;
    continue;
  }
  if (par < tier.par[0]) { tooEasy++; continue; }
  if (par > tier.par[1]) { tooHard++; continue; }

  const n = out.length + 1;
  out.push({ id: `CB-${String(n).padStart(3, "0")}`, ...board, par });
  parCount.set(par, (parCount.get(par) ?? 0) + 1);
}

writeFileSync(OUT, JSON.stringify(out, null, 0) + "\n");

const made = out.length - startAt;
console.log(`${made} new boards, ${out.length} in the archive`);
console.log(`  tried ${tried}: ${unsolvable} unsolvable, ${tooEasy} too easy, ${tooHard} too hard, ${capped} over the search cap`);
console.log(
  "  par spread: " +
    [...parCount.entries()].sort((a, b) => a[0] - b[0]).map(([p, c]) => `${p}:${c}`).join(" ")
);

/* Re-prove everything that is about to ship, including boards written by an
   earlier run. A generator that only checks its own output cannot catch a
   change to the rules that quietly invalidated the file. */
let wrong = 0;
for (const p of out) {
  const again = solve(p, 600_000);
  if (again !== p.par) {
    wrong++;
    console.error(`  ${p.id}: par says ${p.par}, the search says ${again}`);
  }
}
console.log(wrong ? `  ✗ ${wrong} boards disagree with their par` : "  ✓ every board re-proved");
process.exitCode = wrong ? 1 : 0;
