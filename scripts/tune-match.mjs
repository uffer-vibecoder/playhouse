#!/usr/bin/env node
/**
 * What is a good score in Orchard? A tool, not a build step.
 *
 *   node scripts/tune-match.mjs [boards]
 *
 * ── Why ─────────────────────────────────────────────────────────────────────
 *
 * Match-three cannot be proved the way the other archives here are. Cascades
 * mean one swap is a chain of unknown length, and the branching after twenty
 * moves is far past anything a search settles — there is no shortest solution
 * and no uniqueness. So the target is measured instead, which is the promise
 * Free-Atro's rounds and Smallholding's ladder already make.
 *
 * Three players, because a target needs both ends:
 *
 *   careless  the first legal swap it finds, every time. The floor: what a
 *             board pays to someone not looking.
 *   greedy    the swap that pays most this move. What most people actually do.
 *   deep      looks one move ahead and takes the best pair. A ceiling of sorts
 *             — not optimal, but past what anyone plays by eye.
 *
 * A target between greedy and deep is the one worth having: reachable by
 * playing well, not by playing at all.
 *
 * Every move goes through the real `swap`, never a reimplementation of the
 * scoring — the rule `tune-freeatro.mjs` set and for the same reason.
 */

import { deal, initialState, legalMoves, swap } from "../src/games/match/engine.ts";

const BOARDS = Number(process.argv[2] ?? 60);
const MOVES = 20;

const puzzleFor = (board) => ({ id: "T", board, moves: MOVES, target: 0, tier: "gentle" });

function play(seed, pick) {
  const { board } = deal(seed);
  const p = puzzleFor(board);
  let s = initialState(p);

  while (s.moves > 0) {
    const moves = legalMoves(s.board);
    if (!moves.length) break;
    const [a, b] = pick(p, s, seed, moves);
    const m = swap(p, s, seed, a, b);
    if (!m) break;
    s = m.state;
  }
  return s;
}

/** the first thing it sees */
const careless = (_p, _s, _seed, moves) => moves[0];

/** the most this move pays */
const greedy = (p, s, seed, moves) => {
  let best = moves[0], paid = -1;
  for (const [a, b] of moves) {
    const m = swap(p, s, seed, a, b);
    if (m && m.gained > paid) { paid = m.gained; best = [a, b]; }
  }
  return best;
};

/** the most this move and the next one pay together */
const deep = (p, s, seed, moves) => {
  let best = moves[0], paid = -1;
  for (const [a, b] of moves) {
    const m = swap(p, s, seed, a, b);
    if (!m) continue;
    let after = 0;
    if (m.state.moves > 0) {
      for (const [c, d] of legalMoves(m.state.board)) {
        const n = swap(p, m.state, seed, c, d);
        if (n && n.gained > after) after = n.gained;
      }
    }
    if (m.gained + after > paid) { paid = m.gained + after; best = [a, b]; }
  }
  return best;
};

const PLAYERS = { careless, greedy, deep };

const t0 = Date.now();
console.log(`${BOARDS} boards, ${MOVES} swaps each`);
console.log("player     low    q1  median    q3   high    mean   shuffles");

const means = {};
const scores = {};
for (const [name, pick] of Object.entries(PLAYERS)) {
  const got = [];
  let shuffles = 0;
  for (let i = 0; i < BOARDS; i++) {
    const s = play(9000 + i * 131, pick);
    got.push(s.score);
    shuffles += s.shuffles;
  }
  got.sort((a, b) => a - b);
  scores[name] = got;
  const q = (f) => got[Math.floor(got.length * f)];
  const mean = got.reduce((a, b) => a + b, 0) / got.length;
  means[name] = mean;
  console.log(
    name.padEnd(9) +
    String(got[0]).padStart(6) + String(q(0.25)).padStart(6) + String(q(0.5)).padStart(8) +
    String(q(0.75)).padStart(6) + String(got[got.length - 1]).padStart(7) +
    mean.toFixed(0).padStart(8) + (shuffles / BOARDS).toFixed(2).padStart(11)
  );
}

console.log(
  `\n  careless→greedy ${(means.greedy / means.careless).toFixed(2)}× · ` +
  `greedy→deep ${(means.deep / means.greedy).toFixed(2)}×`
);
console.log(
  "  a target between greedy and deep would sit around " +
  `${Math.round((means.greedy + means.deep) / 2 / 50) * 50}`
);

/* How much a board's own luck matters, which decides whether one target can
   serve every board or whether each needs its own — the Free-Atro lesson,
   where a single fixed number turned out to be a lottery across deals. */
const g = scores.greedy;
console.log(
  `  spread across boards under one player: best pays ${(g[g.length - 1] / g[0]).toFixed(1)}× the worst`
);
console.log(`  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
