/**
 * Build the Jigsaw Sudoku archive.
 *
 *   node scripts/build-jigsaw.mjs [count]
 *
 * Three steps, and the first two were both dead ends before they worked.
 *
 * 1. **The shapes.** Growing nine regions from nine seeds produced a valid
 *    partition 3 times in 20,000 attempts — random growth strands cells, and
 *    the last region fed is whatever is left over. So this does not build a
 *    partition, it *moves* to one: start from the nine 3×3 boxes, which are
 *    already legal, and swap pairs of cells across a boundary. A swap keeps
 *    both sizes at nine for free and is kept only if both regions stay
 *    connected. Every state along the way is valid, so nothing fails.
 *
 *    The two cells must not be neighbours. Swapping an adjacent pair always
 *    breaks something: the cell that moves arrives with its only link to its
 *    new region being the cell that just left it. Drawing both from the facing
 *    borders leaves each one a different neighbour to hold on to.
 *
 * 2. **The filling.** Not every partition admits one — about 28% do not, and
 *    that is only knowable by trying. See the engine for why this is exact
 *    cover and not the backtracker it started as.
 *
 * 3. **The clues.** Take cells out one at a time, in a random order, keeping a
 *    removal only while exactly one filling remains. Uniqueness is proved by
 *    the same solver, counting to two and stopping.
 *
 * Append-only, like every archive here. Saves key off the puzzle id, so
 * renumbering would orphan every game in progress. New boards go on the end.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { solve, countSolutions, deduce } from "../src/games/jigsaw/engine.ts";

const OUT = process.env.JS_OUT ?? "src/data/jigsaw.json";
const WANT = Number(process.argv[2] ?? 60);
const N = 9;
const CELLS = 81;

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

const neighbours = (c) => {
  const x = c % N, y = (c / N) | 0;
  const out = [];
  if (x > 0) out.push(c - 1);
  if (x < N - 1) out.push(c + 1);
  if (y > 0) out.push(c - N);
  if (y < N - 1) out.push(c + N);
  return out;
};

function connected(owner, k) {
  const cells = [];
  for (let c = 0; c < CELLS; c++) if (owner[c] === k) cells.push(c);
  const seen = new Set([cells[0]]);
  const stack = [cells[0]];
  while (stack.length) {
    const c = stack.pop();
    for (const n of neighbours(c)) if (owner[n] === k && !seen.has(n)) { seen.add(n); stack.push(n); }
  }
  return seen.size === cells.length;
}

/** How many cells region k puts in any single row or column. */
function widest(owner, k) {
  const rows = new Array(N).fill(0), cols = new Array(N).fill(0);
  for (let c = 0; c < CELLS; c++) if (owner[c] === k) { rows[(c / N) | 0]++; cols[c % N]++; }
  return Math.max(...rows, ...cols);
}

/**
 * Chunky rather than snaky: no region may put more than four cells in one row
 * or column. Measured — uncapped, 30% of partitions took a filling within the
 * budget; capped at four it is 72%, and the shapes read better besides. Three
 * is not an option: a 3×3 box already has exactly three per line, so every
 * swap would violate it and the boxes would never move at all.
 */
const MAX_LINE = 4;

function regionsFrom(r, swaps = 400) {
  const owner = new Array(CELLS);
  for (let c = 0; c < CELLS; c++) {
    const x = c % N, y = (c / N) | 0;
    owner[c] = ((y / 3) | 0) * 3 + ((x / 3) | 0);
  }

  let done = 0;
  for (let t = 0; t < swaps * 30 && done < swaps; t++) {
    const seed = Math.floor(r() * CELLS);
    const ka = owner[seed];
    const facing = neighbours(seed).filter((n) => owner[n] !== ka);
    if (!facing.length) continue;
    const kb = owner[facing[Math.floor(r() * facing.length)]];

    const borderA = [], borderB = [];
    for (let c = 0; c < CELLS; c++) {
      if (owner[c] === ka && neighbours(c).some((n) => owner[n] === kb)) borderA.push(c);
      else if (owner[c] === kb && neighbours(c).some((n) => owner[n] === ka)) borderB.push(c);
    }
    if (!borderA.length || !borderB.length) continue;

    const a = borderA[Math.floor(r() * borderA.length)];
    const b = borderB[Math.floor(r() * borderB.length)];
    owner[a] = kb; owner[b] = ka;
    const ok =
      connected(owner, ka) && connected(owner, kb) &&
      widest(owner, ka) <= MAX_LINE && widest(owner, kb) <= MAX_LINE;
    if (ok) done++;
    else { owner[a] = ka; owner[b] = kb; }
  }
  return owner;
}

/**
 * Take clues out while the board can still be *reasoned* to the end.
 *
 * The first version of this dug against uniqueness alone and produced boards
 * of fourteen clues: perfectly unique, and unfinishable without guessing.
 * Uniqueness is the wrong bar. A removal is kept only while the singles solver
 * can still finish the board, which also proves uniqueness for free — if every
 * step is forced, there is nothing else the answer could be.
 *
 * `allow` is what the solver may use, and it is the difficulty dial: naked
 * singles alone is a gentle board, hidden singles as well is a real one.
 */
function dig(regions, start, r, allow, floor = 0) {
  const given = [...start];
  let clues = given.reduce((n, v) => n + (v ? 1 : 0), 0);

  const order = [...Array(CELLS).keys()];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  for (const c of order) {
    if (clues <= floor) break;
    if (!given[c]) continue; // already gone on an earlier pass
    const keep = given[c];
    given[c] = 0;
    if (deduce(regions, given, allow).solved) clues--;
    else given[c] = keep;
  }
  return { given, clues };
}

/* ── build ────────────────────────────────────────────────────────────────── */

/**
 * Difficulty is which techniques the board may need, not how few clues it has.
 *
 * A gentle board never asks for more than "this cell has one candidate left".
 * A steady one may ask "this value has one place left in this shape", which is
 * the deduction jigsaw regions exist to create. Tricky is the same reasoning
 * dug as far as it will go before the chain breaks.
 */
const TIERS = [
  { tier: "gentle", allow: ["naked"], share: 0.3 },
  { tier: "steady", allow: ["naked", "hidden"], share: 0.4, floor: 30 },
  { tier: "tricky", allow: ["naked", "hidden"], share: 0.3, passes: 3 },
];

/**
 * The label comes from the finished board, not from the recipe that made it.
 *
 * The recipes control how far a board is dug; they do not reliably control how
 * hard it turns out. One board dug by the steady recipe needed no hidden
 * singles at all, which made it easier than every board labelled gentle — a
 * puzzle should not be called harder than it is because of how it was built.
 * So the dig produces a board, and then the board is asked what it needs.
 */
function tierOf(regions, given) {
  const { steps } = deduce(regions, given);
  if (steps.hidden === 0) return "gentle";
  return steps.hidden <= 18 ? "steady" : "tricky";
}

/*
 * `floor` is what makes the middle tier exist at all.
 *
 * Measured: dug as far as they go, boards needing hidden singles all land in
 * the same place — 19 clues and about 26 hidden-single steps — whether the dig
 * runs once or three times. The counts across thirty boards were ten zeroes and
 * then nothing at all until 19. There is no natural middle, so steady is made
 * by stopping the dig early rather than by a different technique.
 */

const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : [];
const out = [...existing];
const startAt = out.length;

let seed = 20260728 + startAt * 7919;
let tried = 0, unfillable = 0, capped = 0;
const clueCounts = new Map();
const t0 = Date.now();

while (out.length - startAt < WANT && tried < WANT * 40) {
  tried++;
  const r = rng(seed++);

  const roll = r();
  let acc = 0;
  const tier = TIERS.find((t) => (acc += t.share) >= roll) ?? TIERS[1];

  const regions = regionsFrom(r);
  const solution = solve(regions, null, 200_000, r);
  if (solution === "capped") { capped++; continue; }
  if (!solution) { unfillable++; continue; }

  /* More passes means more chances for a clue to become removable once its
     neighbours have gone — the same dig run again over what is left. */
  let given = [...solution], clues = CELLS;
  for (let pass = 0; pass < (tier.passes ?? 1); pass++) {
    const got = dig(regions, given, r, tier.allow, tier.floor ?? 0);
    if (got.clues === clues) break;
    given = got.given;
    clues = got.clues;
  }

  const n = out.length + 1;
  const label = tierOf(regions, given);
  out.push({
    id: `JS-${String(n).padStart(3, "0")}`,
    regions,
    given,
    solution,
    clues,
    tier: label,
  });
  const key = label;
  if (!clueCounts.has(key)) clueCounts.set(key, []);
  clueCounts.get(key).push(clues);
}

writeFileSync(OUT, JSON.stringify(out, null, 0) + "\n");

const made = out.length - startAt;
const mean = (xs) => (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1);
console.log(`${made} new boards, ${out.length} in the archive (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
console.log(`  tried ${tried}: ${unfillable} shapes hold no filling, ${capped} over the search cap`);
for (const [tier, xs] of clueCounts)
  console.log(`  ${tier.padEnd(7)} ${xs.length} boards, clues ${Math.min(...xs)}–${Math.max(...xs)} (mean ${mean(xs)})`);

/* Re-prove everything about to ship, including boards written by an earlier
   run. A generator that only checks its own output cannot catch a change that
   quietly invalidated the file. */
let wrong = 0;
for (const p of out) {
  const { n, capped: c } = countSolutions(p.regions, p.given, 2, 400_000);
  if (c || n !== 1) { wrong++; console.error(`  ${p.id}: ${c ? "could not be proved" : `${n} solutions`}`); continue; }
  const again = solve(p.regions, p.given, 400_000);
  if (!Array.isArray(again) || again.some((v, i) => v !== p.solution[i])) {
    wrong++;
    console.error(`  ${p.id}: the answer it ships is not the answer its clues give`);
  }
}
console.log(wrong ? `  ✗ ${wrong} boards are not sound` : "  ✓ every board has exactly one answer, and it is the one it ships");
process.exitCode = wrong ? 1 : 0;
