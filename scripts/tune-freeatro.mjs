#!/usr/bin/env node
/**
 * Calibrate Free-Atro's target curve. A tool, not a build step — it writes
 * nothing and ships nothing.
 *
 *   node scripts/tune-freeatro.mjs
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * The first target curve was written from an estimate: "every card comes home,
 * so the chips are fixed at 144, and a target of 240 asks for an average
 * multiplier of not quite two". Then Noah cleared round one with **697**, which
 * is an average multiplier near five. The estimate was out by a factor of three
 * because standing runs and finished suits stack far faster than guessed.
 *
 * So this measures a floor instead. The solver plays to get home and has no
 * idea scoring exists, so replaying its route gives a **careless win** — a game
 * won with no tableau care at all. A target has to sit clearly above that,
 * because winning alone must not be enough to clear a round.
 *
 * The route is replayed through the real `toFoundation` / `toColumn` / `toCell`
 * rather than through a reimplementation of the scoring, so what comes out is
 * what the game would actually award.
 */

import { readFileSync } from "node:fs";
import {
  CELLS,
  COLUMNS,
  ROUND_RANKS,
  cellsFor,
  deal,
  initialState,
  newRun,
  route,
  toCell,
  toColumn,
  toFoundation,
} from "../src/games/freeatro/engine.ts";

const deals = JSON.parse(readFileSync("src/data/freeatro.json", "utf8"));

/**
 * Work out which move turned one table into the next.
 *
 * The search deals in positions rather than moves, so the move has to be
 * recovered by comparing them. Every case is distinguishable: a foundation
 * advancing, a cell filling or emptying, or one column shrinking while another
 * grows.
 */
function moveBetween(a, b) {
  for (let suit = 0; suit < 4; suit++) {
    if (b.foundations[suit] > a.foundations[suit]) {
      const cell = a.cells.findIndex((c, i) => c !== null && b.cells[i] === null);
      if (cell >= 0) return { kind: "foundation", from: { pile: "cell", index: cell } };
      const col = a.columns.findIndex((c, i) => c.length > b.columns[i].length);
      return { kind: "foundation", from: { pile: "column", index: col } };
    }
  }

  const filledCell = a.cells.findIndex((c, i) => c === null && b.cells[i] !== null);
  if (filledCell >= 0) {
    const col = a.columns.findIndex((c, i) => c.length > b.columns[i].length);
    return { kind: "cell", column: col };
  }

  const emptiedCell = a.cells.findIndex((c, i) => c !== null && b.cells[i] === null);
  if (emptiedCell >= 0) {
    const to = a.columns.findIndex((c, i) => c.length < b.columns[i].length);
    return { kind: "column", from: { pile: "cell", index: emptiedCell }, to, count: 1 };
  }

  const from = a.columns.findIndex((c, i) => c.length > b.columns[i].length);
  const to = a.columns.findIndex((c, i) => c.length < b.columns[i].length);
  if (from < 0 || to < 0) return null;
  return {
    kind: "column",
    from: { pile: "column", index: from },
    to,
    count: b.columns[to].length - a.columns[to].length,
  };
}

/** Replay a route through the real engine and report what it scores. */
function scoreRoute(dealRow, path) {
  const run = newRun();
  let s = initialState({ ...dealRow, ranks: dealRow.ranks ?? ROUND_RANKS }, run);
  for (let i = 1; i < path.length; i++) {
    const move = moveBetween(path[i - 1], path[i]);
    if (!move) return null;
    const before = s;
    if (move.kind === "foundation") s = toFoundation(s, move.from);
    else if (move.kind === "cell") s = toCell(s, move.column);
    else s = toColumn(s, move.from, move.to, move.count);
    // the engine returns the same state for an illegal move, which would mean
    // the diff read the position wrong — better to know than to report a number
    if (s === before) return null;
  }
  return { score: s.score.total, moves: s.moves };
}

/* ── measure ──────────────────────────────────────────────────────────────── */

const scores = [];
let unreadable = 0;

for (const d of deals) {
  const path = route(deal(d.seed, d.ranks ?? ROUND_RANKS, CELLS), 250_000);
  if (!path) continue;
  const got = scoreRoute(d, path);
  if (!got) { unreadable++; continue; }
  scores.push(got.score);
}

scores.sort((a, b) => a - b);
const at = (q) => scores[Math.floor((scores.length - 1) * q)];
const mean = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

console.log(`careless wins scored over ${scores.length} deals` +
  (unreadable ? ` (${unreadable} routes could not be read back)` : ""));
console.log(`  low ${scores[0]}   q1 ${at(0.25)}   median ${at(0.5)}   q3 ${at(0.75)}   high ${scores.at(-1)}`);
console.log(`  mean ${mean}`);
console.log("");
console.log(`For reference, a careful game scored 697 in play — but that was measured before`);
console.log(`the finished-suit multiplier was fixed, so the equivalent game scores more now.`);
console.log(`A round-1 target wants to sit above q3 (${at(0.75)}) so a win alone does not clear it,`);
console.log(`and below a good game so care is rewarded rather than required perfectly.`);

// anchored on the measured distribution alone: a round-one target a quarter
// above the upper quartile of careless wins, climbing past the careless high
const suggestBase = Math.round((at(0.75) * 1.25) / 10) * 10;
const suggestStep = Math.round(((scores.at(-1) * 1.3 - suggestBase) / 5) / 10) * 10;
console.log("");
console.log(`  suggested: targetFor(r) = ${suggestBase} + (r - 1) * ${suggestStep}`);
console.log(`  which gives ${[1, 2, 3, 4, 5, 6].map((r) => suggestBase + (r - 1) * suggestStep).join(", ")}`);

console.log("");
console.log(`(board: ${COLUMNS} columns, ${cellsFor(newRun())} cells, ranks A–${ROUND_RANKS})`);
