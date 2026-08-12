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

import {
  PESTS, TOWERS, build, newRun, runNight, settle, upgrade, upgradeCost, waveFor,
} from "../src/games/farm/engine.ts";

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
 * The reference player's whole strategy: build wide, then build up.
 *
 * It fills good ground first and only starts upgrading once it has a few
 * towers standing, which is roughly what a person does without thinking hard.
 * No reacting, no selling, no judging one night against the next — that is the
 * point. It is a floor, not a ceiling.
 *
 * Every move goes through the real `build` and `upgrade`, which refuse an
 * unaffordable or occupied one by returning the same run back. Comparing by
 * identity is how this knows to stop, exactly as `tune-freeatro.mjs` does.
 */
function spend(run) {
  const taken = new Set(run.towers.map((t) => t.at));
  const want =
    run.towers.length >= 3 && !run.towers.some((t) => t.kind === "sprinkler") ? "sprinkler"
    : run.towers.filter((t) => t.kind === "beehive").length * 3 < run.towers.length ? "beehive"
    : "scarecrow";

  // a fourth tower is worth more than a second level, until there are five
  if (run.towers.length < 5) {
    const site = sites(TOWERS[want].range).find((s) => !taken.has(s.at));
    if (site) {
      const next = build(run, site.at, want, PATH);
      if (next !== run) return next;
    }
  }

  // then pour money into whatever sees the most path
  const best = [...run.towers]
    .filter((t) => upgradeCost(t) !== null)
    .sort((a, b) => (seenBy(b) - seenBy(a)) || (a.level - b.level));
  for (const t of best) {
    const next = upgrade(run, t.at);
    if (next !== run) return next;
  }

  const site = sites(TOWERS[want].range).find((s) => !taken.has(s.at));
  if (site) {
    const next = build(run, site.at, want, PATH);
    if (next !== run) return next;
  }
  return run;
}

const seenBy = (t) => sites(TOWERS[t.kind].range).find((s) => s.at === t.at)?.seen ?? 0;

function playRun(seed) {
  let run = newRun();

  while (!run.over && run.night < 200) {
    for (;;) {
      const next = spend(run);
      if (next === run) break; // nothing left it can afford
      run = next;
    }
    const r = runNight({ w: W, h: H, path: PATH, towers: run.towers }, waveFor(run.night, seed));
    run = settle(run, r);
  }
  return { nights: run.history.length, towers: run.towers.length };
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
