/**
 * Build the Orchard archive.
 *
 *   node scripts/build-match.mjs [count]
 *
 * ── Why every board carries its own target ──────────────────────────────────
 *
 * Match-three cannot be proved the way the other archives here are — cascades
 * make one swap a chain of unknown length, so there is no shortest solution to
 * find and no uniqueness to establish. The target is measured instead.
 *
 * And it is measured **per board**, not once for all of them. Across sixty
 * boards played by the same player, the luckiest paid 3.2× the unluckiest.
 * That is the mistake Free-Atro shipped and had to be dug out of: a single
 * fixed number against deals that vary that much is not a difficulty setting,
 * it is a lottery, and on the poor boards it is unreachable however well you
 * play. Nothing tells the player that; the round simply ends.
 *
 * So each board is played here by a greedy player — the swap that pays most
 * this move, which is roughly what an attentive person does by eye — and the
 * target is a share of what that scored on *that* board.
 *
 * Measured over sixty boards, twenty swaps each:
 *
 *     careless  mean 1063   (the first legal swap it sees)
 *     greedy    mean 4421   (best this move)
 *     deep      mean 9260   (best over this move and the next)
 *
 * The shares below sit between greedy and deep on purpose: reachable by playing
 * well, not by playing at all, and never asking for what only a search finds.
 *
 * Append-only, like every archive here.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { deal, initialState, legalMoves, swap } from "../src/games/match/engine.ts";

const OUT = process.env.MT_OUT ?? "src/data/match.json";
const WANT = Number(process.argv[2] ?? 60);
const MOVES = 20;

const TIERS = [
  { tier: "gentle", share: 0.85, weight: 0.35 },
  { tier: "steady", share: 1.15, weight: 0.4 },
  { tier: "tricky", share: 1.5, weight: 0.25 },
];

/** The swap that pays most this move — what an attentive person does by eye. */
function greedyScore(board, seed) {
  const p = { id: "T", board, moves: MOVES, target: 0, tier: "gentle" };
  let s = initialState(p);
  while (s.moves > 0) {
    const moves = legalMoves(s.board);
    if (!moves.length) break;
    let best = null, paid = -1;
    for (const [a, b] of moves) {
      const m = swap(p, s, seed, a, b);
      if (m && m.gained > paid) { paid = m.gained; best = m; }
    }
    if (!best) break;
    s = best.state;
  }
  return s.score;
}

const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : [];
const out = [...existing];
const startAt = out.length;

let seed = 20260812 + startAt * 7919;
const byTier = new Map();
const t0 = Date.now();

while (out.length - startAt < WANT) {
  const s = seed++;
  const { board } = deal(s);
  const par = greedyScore(board, s);
  if (par < 1500) continue; // a board too poor to be worth anyone's twenty swaps

  const n = out.length + 1;
  const pick = TIERS[(n - 1) % TIERS.length];
  const target = Math.round((par * pick.share) / 25) * 25;

  out.push({
    id: `MT-${String(n).padStart(3, "0")}`,
    seed: s,
    board,
    moves: MOVES,
    target,
    tier: pick.tier,
    /** what the greedy player actually scored here, so the share is checkable */
    par,
  });
  if (!byTier.has(pick.tier)) byTier.set(pick.tier, []);
  byTier.get(pick.tier).push(target);
}

writeFileSync(OUT, JSON.stringify(out, null, 0) + "\n");

const made = out.length - startAt;
const mean = (xs) => (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(0);
console.log(`${made} new boards, ${out.length} in the archive (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
for (const [tier, xs] of byTier) {
  console.log(`  ${tier.padEnd(7)} ${xs.length} boards, target ${Math.min(...xs)}–${Math.max(...xs)} (mean ${mean(xs)})`);
}

/* Re-prove what is about to ship. A generator that only checks its own output
   cannot catch a change that quietly invalidated the file. */
let wrong = 0;
for (const p of out) {
  if (p.board.length !== 64) { wrong++; console.error(`  ${p.id}: not a board`); continue; }
  const again = greedyScore(p.board, p.seed);
  if (again !== p.par) {
    wrong++;
    console.error(`  ${p.id}: par says ${p.par}, playing it again gives ${again}`);
    continue;
  }
  if (p.target > p.par * 1.6) {
    wrong++;
    console.error(`  ${p.id}: target ${p.target} is out of reach of a ${p.par} board`);
  }
}
console.log(wrong ? `  ✗ ${wrong} boards are not sound` : "  ✓ every board replays to its par, and no target is out of reach");
process.exitCode = wrong ? 1 : 0;
