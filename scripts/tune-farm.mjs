#!/usr/bin/env node
/**
 * How long does a reasonable player last? A tool, not a build step — it writes
 * nothing and ships nothing.
 *
 *   node scripts/tune-farm.mjs [runs]
 *
 * ── Why ─────────────────────────────────────────────────────────────────────
 *
 * An endless game cannot be proved winnable — losing is the point — so the
 * promise has to be that the *curve was measured*. This is the measurement.
 *
 * A scripted player buys towers by an obvious rule and plays nights until it
 * is overrun. Whatever it survives is the floor: a person who thinks about
 * placement should beat it, and a person who is not paying attention should
 * come close to it. If the reference dies on night three the game is a wall;
 * if it reaches forty the ladder is flat.
 *
 * The nights are played through the *real* `runNight`, never a reimplementation
 * of it — the same rule `tune-freeatro.mjs` follows, and for the same reason:
 * what comes out has to be what the game would actually do.
 *
 * The Free-Atro mistake worth not repeating: its targets were set from a
 * measured floor while the ceiling was assumed, and half the deals turned out
 * to be unwinnable. So this reports the spread, not an average.
 */

import { PESTS, TOWERS, runNight, waveFor } from "../src/games/farm/engine.ts";

const RUNS = Number(process.argv[2] ?? 200);

/* The field the reference plays: a path that snakes so towers in the middle
   cover several stretches of it, which is what makes placement a decision. */
const W = 8, H = 6;
const PATH = [
  0, 1, 2, 3, 4, 5, 6, 7,
  15, 23,
  22, 21, 20, 19, 18, 17, 16,
  24, 32,
  33, 34, 35, 36, 37, 38, 39,
  47,
];
const onPath = new Set(PATH);

/** Every cell a tower could stand on, best first: the more of the path a cell
 *  can see, the better it is, which is the only rule the reference knows. */
function sites(range) {
  const out = [];
  for (let c = 0; c < W * H; c++) {
    if (onPath.has(c)) continue;
    const x = c % W, y = Math.floor(c / W);
    let seen = 0;
    for (const p of PATH) {
      const dx = x - (p % W), dy = y - Math.floor(p / W);
      if (dx * dx + dy * dy <= range * range) seen++;
    }
    if (seen > 0) out.push({ at: c, seen });
  }
  return out.sort((a, b) => b.seen - a.seen);
}

/**
 * The reference player's whole strategy.
 *
 * Buy the best-covered free site it can afford, preferring scarecrows early
 * because they are cheap, adding a beehive once there is money for one, and a
 * sprinkler once there are guns worth holding pests in front of. No upgrades,
 * no reacting, no cleverness — that is the point.
 */
function buy(coins, towers) {
  const taken = new Set(towers.map((t) => t.at));
  const want =
    towers.length >= 3 && !towers.some((t) => t.kind === "sprinkler") ? "sprinkler"
    : towers.filter((t) => t.kind === "beehive").length * 3 < towers.length ? "beehive"
    : "scarecrow";

  const spec = TOWERS[want];
  if (coins < spec.cost) return null;
  const site = sites(spec.range).find((s) => !taken.has(s.at));
  return site ? { at: site.at, kind: want } : null;
}

const START_COINS = 60;
const STIPEND = 14; // what the farm pays each day before any crops exist
const LIVES = 5;

function playRun(seed) {
  const towers = [];
  let coins = START_COINS;
  let lives = LIVES;
  let night = 0;

  while (lives > 0 && night < 200) {
    night++;
    // the day: spend until nothing more is affordable
    for (;;) {
      const t = buy(coins, towers);
      if (!t) break;
      coins -= TOWERS[t.kind].cost;
      towers.push(t);
    }
    const r = runNight({ w: W, h: H, path: PATH, towers }, waveFor(night, seed));
    lives -= r.leaked;
    coins += r.earned + STIPEND;
  }
  return { nights: night - 1, towers: towers.length };
}

const nights = [];
const t0 = Date.now();
for (let i = 0; i < RUNS; i++) nights.push(playRun(1000 + i).nights);
nights.sort((a, b) => a - b);

const q = (p) => nights[Math.floor(nights.length * p)];
console.log(`${RUNS} runs of the reference player (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
console.log(`  nights survived: low ${nights[0]} · q1 ${q(0.25)} · median ${q(0.5)} · q3 ${q(0.75)} · high ${nights[nights.length - 1]}`);
console.log(`  mean ${(nights.reduce((a, b) => a + b, 0) / nights.length).toFixed(1)}`);

/* Where it actually falls apart, which is more use than the average */
const byNight = new Map();
for (const n of nights) byNight.set(n, (byNight.get(n) ?? 0) + 1);
console.log("  died on night: " +
  [...byNight.entries()].sort((a, b) => a[0] - b[0]).map(([n, c]) => `${n}×${c}`).join(" "));

/* And a look at one wave's shape, so the ladder can be read rather than felt */
console.log("\n  wave sizes: " +
  [1, 3, 5, 8, 12, 16, 20].map((n) => `n${n}:${waveFor(n, 1).length}`).join(" "));
console.log("  pest hp: " +
  Object.entries(PESTS).map(([k, v]) => `${k} ${v.hp}`).join(" "));
