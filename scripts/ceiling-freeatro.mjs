#!/usr/bin/env node
/**
 * Measure the most each Free-Atro deal can pay, and write it into the archive.
 *
 *   node scripts/ceiling-freeatro.mjs
 *
 * ── Why ─────────────────────────────────────────────────────────────────────
 *
 * The target curve was set from a *careless* win — the solver's route, which
 * plays to get home and knows nothing about scoring — on the assumption that
 * careful play scores far more. That half was never measured. It does not:
 *
 *     careless win (solver route)   median 399
 *     near-perfect (beam of 150)    median 641
 *
 * Only about 1.6× between playing badly and playing nearly perfectly, and the
 * round-one target sat at 560 — cleared by a *machine* on 8 deals in 12. No
 * person was ever going to clear it.
 *
 * Worse, the ceiling is not the same from deal to deal. It ran 411 to 782
 * across the first twelve. A single fixed target against deals that vary
 * two-fold is not a difficulty setting, it is a lottery: on the low deals the
 * round was unwinnable however well it was played, and nothing said so.
 *
 * So every deal carries its own ceiling, and the target is a share of it. This
 * writes that number into `src/data/freeatro.json`, adding a field rather than
 * changing one — the save fingerprint is the deal's seed, so nothing in
 * progress is orphaned.
 *
 * The beam is a machine playing well, not a person. The share in `targetFor`
 * is set well under it for that reason.
 */

import { readFileSync, writeFileSync } from "node:fs";
import {
  ROUND_RANKS,
  initialState,
  newRun,
  toCell,
  toColumn,
  toFoundation,
} from "../src/games/freeatro/engine.ts";

const OUT = process.env.FA_OUT ?? "src/data/freeatro.json";
const WIDTH = Number(process.argv[2] ?? 150);

const deals = JSON.parse(readFileSync(OUT, "utf8"));

/** Every legal move from a state, already applied. */
function successors(s) {
  const out = [];
  const t = s.table;
  for (let c = 0; c < t.columns.length; c++) {
    const a = toFoundation(s, { pile: "column", index: c });
    if (a !== s) out.push(a);
    for (let d = 0; d < t.columns.length; d++) {
      if (c === d) continue;
      const b = toColumn(s, { pile: "column", index: c }, d);
      if (b !== s) out.push(b);
    }
    if (t.cells.some((x) => x === null)) {
      const e = toCell(s, c);
      if (e !== s) out.push(e);
    }
  }
  for (let i = 0; i < t.cells.length; i++) {
    if (t.cells[i] === null) continue;
    const a = toFoundation(s, { pile: "cell", index: i });
    if (a !== s) out.push(a);
    for (let d = 0; d < t.columns.length; d++) {
      const b = toColumn(s, { pile: "cell", index: i }, d);
      if (b !== s) out.push(b);
    }
  }
  return out;
}

const won = (s) => s.table.foundations.every((f) => f === s.table.ranks - 1);
const home = (s) => s.table.foundations.reduce((n, f) => n + f + 1, 0);

/* Columns and cells are interchangeable, so the key sorts them — the same fold
   every search on this site needs, and the same one Colour Blocks got wrong. */
const keyOf = (s) =>
  s.table.columns.map((c) => c.join(",")).sort().join("|") +
  "#" + [...s.table.cells].sort().join(",") +
  "#" + s.table.foundations.join(",") +
  "#" + s.score.total;

/** The best score a wide beam can find on this deal, playing to win. */
function ceilingOf(dealRow, run, width) {
  let beam = [initialState({ ...dealRow, ranks: dealRow.ranks ?? ROUND_RANKS }, run)];
  const seen = new Set();
  let best = null;

  for (let step = 0; step < 400 && beam.length; step++) {
    const next = [];
    for (const s of beam) {
      for (const n of successors(s)) {
        const k = keyOf(n);
        if (seen.has(k)) continue;
        seen.add(k);
        if (won(n)) {
          if (!best || n.score.total > best) best = n.score.total;
          continue;
        }
        next.push(n);
      }
    }
    next.sort(
      (a, b) => b.score.total - a.score.total || b.score.mult - a.score.mult || home(b) - home(a)
    );
    beam = next.slice(0, width);
  }
  return best;
}

const run = newRun();
const found = [];
const t0 = Date.now();

for (const d of deals) {
  const c = ceilingOf(d, run, WIDTH);
  if (c === null) {
    console.error(`  ${d.id}: no win found — leaving its ceiling alone`);
    continue;
  }
  d.ceiling = c;
  found.push(c);
}

writeFileSync(OUT, JSON.stringify(deals, null, 0) + "\n");

found.sort((a, b) => a - b);
const q = (p) => found[Math.floor(found.length * p)];
console.log(`${found.length} of ${deals.length} deals measured (${((Date.now() - t0) / 1000).toFixed(1)}s, beam ${WIDTH})`);
console.log(`  ceiling: low ${found[0]} · q1 ${q(0.25)} · median ${q(0.5)} · q3 ${q(0.75)} · high ${found[found.length - 1]}`);
console.log(`  spread: the best deal pays ${(found[found.length - 1] / found[0]).toFixed(1)}× the worst`);
