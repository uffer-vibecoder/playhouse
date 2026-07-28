#!/usr/bin/env node
/**
 * Build the Word Tray archive.
 *
 *   node scripts/build-wordtray.mjs [count]
 *
 * A puzzle is seven letters and an interlocking grid built only from words
 * those letters make. Which is the whole reason this game is on the list: it is
 * crossword construction with **no clue writing** — the letters are the clue —
 * and clue writing is exactly what parked the themed crosswords.
 *
 * The open question was whether the fill would work at all. A crossword
 * compiler normally draws on tens of thousands of words; here the pool is only
 * what one tray makes. Measured before building anything: a seven-letter tray
 * with no repeated letter yields a median of 27 words, and the fill packed six
 * or more into a grid for 199 of 199 trays. So the worry was unfounded, and it
 * was worth ten minutes to find that out rather than discovering it after
 * writing a game around it.
 *
 * Append-only, like every archive here.
 */

import { readFileSync } from "node:fs";

const H = process.env.HOME + "/Claude/codeword/data/";
const load = f => readFileSync(H + f, "utf8").split("\n").map(w => w.trim().toUpperCase()).filter(Boolean);
const block = new Set(load("blocklist.txt"));

/**
 * Two vocabularies, and the split matters.
 *
 * Grid words come from the common list, because a grid you cannot finish
 * without an obscure word is a bad puzzle. Bonus words come from the whole
 * 57k list, because being told "no" for spelling something real is the fastest
 * way to stop wanting to play — HALO and BASIL were both refused on the first
 * build, which is exactly the failure the word game already avoids by checking
 * guesses against a far wider list than it draws answers from.
 */
const common = [...new Set([...load("words-common.txt"), ...load("extra-words.txt")])]
  .filter(w => !block.has(w) && /^[A-Z]{3,7}$/.test(w));
const wide = [...new Set([...load("words.txt"), ...load("extra-words.txt")])]
  .filter(w => !block.has(w) && /^[A-Z]{3,7}$/.test(w));

const words = common;

const sig = w => [...w].sort().join("");
const indexOf = list => {
  const m = new Map();
  for (const w of list) { const k = sig(w); (m.get(k) ?? m.set(k, []).get(k)).push(w); }
  return m;
};
const index = indexOf(common);
const wideIndex = indexOf(wide);

const subsetsOf = letters => {
  const out = [];
  for (let mask = 1; mask < 1 << letters.length; mask++) {
    const pick = [];
    for (let i = 0; i < letters.length; i++) if (mask & (1 << i)) pick.push(letters[i]);
    if (pick.length >= 3) out.push(pick.sort().join(""));
  }
  return out;
};

const wordsFor = (tray, from = index) => {
  const found = new Set();
  for (const k of subsetsOf([...tray])) for (const w of from.get(k) ?? []) found.add(w);
  return [...found];
};

/* ── the fill ──────────────────────────────────────────────────────────────
   A grid is a Map of "x,y" -> letter plus the placed words. A word may only be
   added by crossing exactly one letter already down, at right angles, and it
   may not run alongside another word — the classic crossword constraint, and
   the thing that makes a small vocabulary hard to pack.
── */
const key = (x, y) => `${x},${y}`;

function canPlace(cells, word, x, y, horiz) {
  let crossings = 0;
  for (let i = 0; i < word.length; i++) {
    const cx = horiz ? x + i : x;
    const cy = horiz ? y : y + i;
    const here = cells.get(key(cx, cy));
    if (here) {
      if (here !== word[i]) return null;
      crossings++;
    } else {
      // the two cells either side, across the word's direction, must be clear
      const a = horiz ? cells.get(key(cx, cy - 1)) : cells.get(key(cx - 1, cy));
      const b = horiz ? cells.get(key(cx, cy + 1)) : cells.get(key(cx + 1, cy));
      if (a || b) return null;
    }
  }
  // and the ends must not butt onto another word
  const beforeX = horiz ? x - 1 : x, beforeY = horiz ? y : y - 1;
  const afterX = horiz ? x + word.length : x, afterY = horiz ? y : y + word.length;
  if (cells.get(key(beforeX, beforeY)) || cells.get(key(afterX, afterY))) return null;
  return crossings === 1 ? true : null;
}

function fill(pool, want, maxSide) {
  /**
   * The longest word is the spine, and everything after it goes shortest first.
   *
   * Sorting the whole pool longest-first filled every grid with six- and
   * seven-letter words and left the threes and fours out entirely, which made a
   * tray far harder than it needed to be: the short words are the way in, the
   * long one is the reward. Short words also cross more easily, so this packs
   * better as well as reading easier.
   */
  const byLength = [...pool].sort((a, b) => b.length - a.length || a.localeCompare(b));
  const first = byLength[0];
  /**
   * A spread of lengths, taken round-robin.
   *
   * Three orderings were tried before this one. Longest-first filled every grid
   * with sixes and sevens and left the threes out entirely. Shortest-first made
   * them nearly all threes. Sorting by distance from four made them nearly all
   * fours, and worse, samey — one tray offered BARE, BEAR, BEAT, BETA, BORE and
   * BRED, which is the same word six times to a solver.
   *
   * Cycling the buckets gives a real mix: a three, then a four, then a five,
   * then round again. The long spine still goes first, because it is the one
   * word the grid is built around.
   */
  const buckets = new Map();
  for (const w of byLength.slice(1)) {
    if (!buckets.has(w.length)) buckets.set(w.length, []);
    buckets.get(w.length).push(w);
  }
  const lengths = [...buckets.keys()].sort((a, b) => a - b);
  const rest = [];
  for (let round = 0; rest.length < byLength.length - 1; round++) {
    let took = false;
    for (const n of lengths) {
      const bucket = buckets.get(n);
      if (round < bucket.length) { rest.push(bucket[round]); took = true; }
    }
    if (!took) break;
  }
  const sorted = [first, ...rest];
  const cells = new Map();
  for (let i = 0; i < first.length; i++) cells.set(key(i, 0), first[i]);
  const placed = [{ word: first, x: 0, y: 0, horiz: true }];

  for (const word of sorted.slice(1)) {
    if (placed.length >= want) break;
    let done = false;
    for (const [k, letter] of [...cells.entries()]) {
      if (done) break;
      const [cx, cy] = k.split(",").map(Number);
      for (let i = 0; i < word.length && !done; i++) {
        if (word[i] !== letter) continue;
        for (const horiz of [false, true]) {
          const x = horiz ? cx - i : cx;
          const y = horiz ? cy : cy - i;
          if (canPlace(cells, word, x, y, horiz) === null) continue;
          const test = new Map(cells);
          for (let j = 0; j < word.length; j++)
            test.set(key(horiz ? x + j : x, horiz ? y : y + j), word[j]);
          const xs = [...test.keys()].map(s => +s.split(",")[0]);
          const ys = [...test.keys()].map(s => +s.split(",")[1]);
          if (Math.max(...xs) - Math.min(...xs) + 1 > maxSide) continue;
          if (Math.max(...ys) - Math.min(...ys) + 1 > maxSide) continue;
          for (const [kk, vv] of test) cells.set(kk, vv);
          placed.push({ word, x, y, horiz });
          done = true;
          break;
        }
      }
    }
  }
  return { cells, placed };
}

/* ── build ────────────────────────────────────────────────────────────────── */

import { writeFileSync, existsSync } from "node:fs";

/* WT_OUT lets a tuning run write somewhere harmless — the real archive is
   append-only and a measurement must not touch it. */
const OUT = process.env.WT_OUT ?? "src/data/wordtray.json";
const WANT = Number(process.argv[2] ?? 60);
/** how many words to pack into a grid, and how wide the grid may get */
const WORDS = Number(process.argv[3] ?? 8);
const SIDE = Number(process.argv[4] ?? 9);

const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : [];
const out = [...existing];
const startAt = out.length;
const already = new Set(out.map((p) => p.letters));

const roots = words.filter((w) => w.length === 7 && new Set(w).size === 7).sort();

let tried = 0, thin = 0, unfilled = 0;
const counts = [], bonuses = [];

for (const root of roots) {
  if (out.length - startAt >= WANT) break;
  const letters = [...root].sort().join("");
  if (already.has(letters)) continue;
  tried++;

  const pool = wordsFor(root);
  if (pool.length < 10) { thin++; continue; }

  const { cells, placed } = fill(pool, WORDS, SIDE);
  if (placed.length < 6) { unfilled++; continue; }

  // shift the grid so it starts at 0,0 and ships as small as it is
  const xs = [...cells.keys()].map((s) => +s.split(",")[0]);
  const ys = [...cells.keys()].map((s) => +s.split(",")[1]);
  const ox = Math.min(...xs), oy = Math.min(...ys);
  const w = Math.max(...xs) - ox + 1, h = Math.max(...ys) - oy + 1;

  const inGrid = new Set(placed.map((p) => p.word));
  const n = out.length + 1;
  out.push({
    id: `WT-${String(n).padStart(3, "0")}`,
    letters: root,
    w, h,
    words: placed.map((p) => ({ word: p.word, x: p.x - ox, y: p.y - oy, across: p.horiz })),
    // everything else the tray makes, from the wide list: found, these are
    // bonus rather than wrong
    bonus: wordsFor(root, wideIndex).filter((word) => !inGrid.has(word)).sort(),
  });
  already.add(letters);
  counts.push(placed.length);
  bonuses.push(pool.length - placed.length);
}

writeFileSync(OUT, JSON.stringify(out, null, 0) + "\n");

const made = out.length - startAt;
const mean = (xs) => (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1);
console.log(`${made} new trays, ${out.length} in the archive`);
console.log(`  tried ${tried}: ${thin} too few words, ${unfilled} would not pack`);
console.log(`  asked for ${WORDS} words in at most ${SIDE}×${SIDE}`);
console.log(`  grid words ${Math.min(...counts)}–${Math.max(...counts)} (mean ${mean(counts)}), bonus words mean ${mean(bonuses)}`);

/* Every grid word has to be spellable from its own tray, and every crossing has
   to agree. A generator that only checks its own output cannot catch a change
   that quietly invalidated the file. */
let bad = 0;
for (const p of out) {
  const bag = [...p.letters];
  for (const { word, x, y, across } of p.words) {
    const spare = [...bag];
    for (const ch of word) {
      const i = spare.indexOf(ch);
      if (i < 0) { console.error(`  ${p.id}: ${word} needs letters the tray lacks`); bad++; break; }
      spare.splice(i, 1);
    }
    if (x < 0 || y < 0 || (across ? x + word.length > p.w : y + word.length > p.h)) {
      console.error(`  ${p.id}: ${word} runs off the grid`);
      bad++;
    }
  }
  const seen = new Map();
  for (const { word, x, y, across } of p.words)
    for (let i = 0; i < word.length; i++) {
      const k = across ? `${x + i},${y}` : `${x},${y + i}`;
      if (seen.has(k) && seen.get(k) !== word[i]) { console.error(`  ${p.id}: crossing disagrees at ${k}`); bad++; }
      seen.set(k, word[i]);
    }
}
console.log(bad ? `  ✗ ${bad} problems` : "  ✓ every word spellable and every crossing agrees");
process.exitCode = bad ? 1 : 0;
