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

/**
 * Three players, so the *choice* can be measured and not just the outcome.
 *
 * Noah's read after playing was "build wide for now", which is a verdict on the
 * design rather than a preference: if spreading out is always right then the
 * upgrade button is decoration and the day has no decision in it. These three
 * settle that. If wide and tall land in the same band, the choice is real; if
 * one runs away with it, the numbers need moving.
 */
const PLAYERS = {
  wide: (run) => {
    const taken = new Set(run.towers.map((t) => t.at));
    const want = pickKind(run);
    const site = sites(TOWERS[want].range).find((s) => !taken.has(s.at));
    return site ? build(run, site.at, want, PATH) : run;
  },
  tall: (run) => {
    // four towers and then everything into levels
    if (run.towers.length < 4) {
      const taken = new Set(run.towers.map((t) => t.at));
      const want = pickKind(run);
      const site = sites(TOWERS[want].range).find((s) => !taken.has(s.at));
      if (site) { const n = build(run, site.at, want, PATH); if (n !== run) return n; }
    }
    const best = [...run.towers]
      .filter((t) => upgradeCost(t) !== null)
      .sort((a, b) => (seenBy(b) - seenBy(a)) || (a.level - b.level));
    for (const t of best) { const n = upgrade(run, t.at); if (n !== run) return n; }
    return run;
  },
  mixed: spend,
};

function pickKind(run) {
  return run.towers.length >= 3 && !run.towers.some((t) => t.kind === "sprinkler") ? "sprinkler"
    : run.towers.filter((t) => t.kind === "beehive").length * 3 < run.towers.length ? "beehive"
    : "scarecrow";
}

function playRun(seed, how = "mixed") {
  let run = newRun();
  const step = PLAYERS[how];

  while (!run.over && run.night < 200) {
    for (;;) {
      const next = step(run);
      if (next === run) break; // nothing left it can afford
      run = next;
    }
    const r = runNight({ w: W, h: H, path: PATH, towers: run.towers }, waveFor(run.night, seed));
    run = settle(run, r);
  }
  return { nights: run.history.length, towers: run.towers.length };
}

const t0 = Date.now();
console.log(`${RUNS} runs each (${new Date().toISOString().slice(11, 19)})`);
console.log("player   low   q1  median   q3  high   mean   towers");

const summary = {};
for (const how of ["wide", "tall", "mixed"]) {
  const nights = [];
  let towers = 0;
  for (let i = 0; i < RUNS; i++) {
    const r = playRun(1000 + i, how);
    nights.push(r.nights);
    towers += r.towers;
  }
  nights.sort((a, b) => a - b);
  const q = (p) => nights[Math.floor(nights.length * p)];
  const mean = nights.reduce((a, b) => a + b, 0) / nights.length;
  summary[how] = mean;
  console.log(
    how.padEnd(8) +
    String(nights[0]).padStart(3) + String(q(0.25)).padStart(5) + String(q(0.5)).padStart(8) +
    String(q(0.75)).padStart(5) + String(nights[nights.length - 1]).padStart(6) +
    mean.toFixed(1).padStart(7) + (towers / RUNS).toFixed(1).padStart(9)
  );
}

const gap = Math.abs(summary.wide - summary.tall);
console.log(
  `\n  wide and tall differ by ${gap.toFixed(1)} nights — ` +
  (gap < 1.5
    ? "close enough that the choice is real"
    : `${summary.wide > summary.tall ? "wide" : "tall"} is simply better, so it is not a decision`)
);
console.log(`  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

/* And a look at one wave's shape, so the ladder can be read rather than felt */
console.log("\n  wave sizes: " +
  [1, 3, 5, 8, 12, 16, 20].map((n) => `n${n}:${waveFor(n, 1).length}`).join(" "));
console.log("  pest hp: " +
  Object.entries(PESTS).map(([k, v]) => `${k} ${v.hp}`).join(" "));
