/**
 * Smallholding — a farm by day, a siege by night.
 *
 * Zero imports, like every engine here.
 *
 * ── Why a night is a pure function ──────────────────────────────────────────
 *
 * You lay out the defence during the day and then watch. Nothing you do after
 * nightfall changes the outcome — which means the night does not need to be
 * played, it needs to be *computed*. `runNight` simulates the whole thing at
 * once and hands back a replay; the board animates that replay afterwards at
 * whatever speed it likes.
 *
 * That is not a shortcut, it is the reason this game can live here at all:
 *
 *   - **No game loop.** Nothing else in this repo advances with time, and this
 *     does not either. The only loop is presentational, so a stuttering frame
 *     or a sleeping tab cannot desync anything — the answer was settled before
 *     the first frame was drawn.
 *   - **It is testable.** The same field, wave and seed always give the same
 *     result, and a test can say so.
 *   - **It is measurable.** An endless game cannot be proved winnable, so the
 *     difficulty gets measured instead — thousands of nights run headlessly by
 *     a scripted player. Free-Atro's targets were set this way.
 *
 * ── Everything is an integer ────────────────────────────────────────────────
 *
 * Positions are counted in `STEPS` per path cell rather than in fractions of a
 * cell, and every speed, range and cooldown is a whole number of them. Nothing
 * in the simulation is a float, so "deterministic" is a property of the types
 * rather than a hope about rounding. The board divides by `STEPS` when it comes
 * to draw, and that is the only place a fraction appears.
 */

/** Sub-positions per cell of path. Twelve divides into halves, thirds and
 *  quarters, so a speed can be "two thirds of a cell a tick" exactly. */
export const STEPS = 12;

/* ── the field ────────────────────────────────────────────────────────────── */

export type Field = {
  w: number;
  h: number;
  /** the route from the gate to the house, as cell indices in order */
  path: number[];
  towers: Tower[];
};

export type TowerKind = "scarecrow" | "beehive" | "sprinkler";

export type Tower = {
  /** the cell it stands on — never a path cell */
  at: number;
  kind: TowerKind;
  /** 1, 2 or 3. A level is bought, and is what makes a good spot worth keeping */
  level: number;
};

export const MAX_LEVEL = 3;

/**
 * What a tower is worth at its level.
 *
 * Damage grows faster than range: a level buys *more of what the tower already
 * does* rather than turning it into a different tower. A scarecrow that could
 * reach across the field at level three would make the beehive pointless.
 */
export function statsOf(t: Tower) {
  const base = TOWERS[t.kind];
  const step = t.level - 1;
  return {
    ...base,
    damage: Math.round(base.damage * (1 + step * 0.8)),
    range: base.range + (t.level >= 3 ? 1 : 0),
    cool: Math.max(2, base.cool - step),
  };
}

/**
 * What the next level costs, or null when there is no next level.
 *
 * **This number is the whole decision, and finding that out took a wrong turn
 * worth recording.**
 *
 * Spreading out used to be simply the better play. Across 150 runs the wide
 * player reached a mean of 10.6 nights on seventeen towers while the upgrading
 * player managed 8.7 on four — not a decision, an answer, with the upgrade
 * button as decoration. The arithmetic said why: a second scarecrow cost 20,
 * doubled the damage and covered new ground, while a level cost 28 and added
 * 80% to the same patch.
 *
 * The tempting fix was to make land dearer the more of it you take. It works,
 * and it overshoots hard — at 22% a tower the upgrading player won by 4.4
 * nights instead, and every setting down to 6% still favoured building tall.
 * It was also a rule the player would have had to learn, for nothing.
 *
 * The culprit was the price of a level. At 0.7 + 0.5·level, with land staying
 * flat, 400 runs each:
 *
 *     wide   median 11 · mean 10.8 · 17.7 towers
 *     tall   median 11 · mean 10.8 ·  4.0 towers
 *     mixed  median 12 · mean 11.7 ·  6.3 towers
 *
 * Dead level, and *combining* them beats either — which is what a decision is
 * supposed to look like.
 */
export const upgradeCost = (t: Tower): number | null =>
  t.level >= MAX_LEVEL ? null : Math.round(TOWERS[t.kind].cost * (0.7 + 0.5 * t.level));

/**
 * Half of everything sunk in, rounded down.
 *
 * Enough to fix a bad placement, not enough to make placement free. Levels
 * count towards it, so moving a tower you have poured money into still hurts —
 * a spot is worth choosing carefully precisely because it becomes expensive to
 * abandon.
 */
export function sellValue(t: Tower): number {
  let paid = TOWERS[t.kind].cost;
  for (let l = 1; l < t.level; l++) paid += upgradeCost({ ...t, level: l }) ?? 0;
  return Math.floor(paid / 2);
}

/**
 * What each tower does, and they are deliberately not variations of one thing.
 *
 * The Free-Atro shop rule applies: three options that differ only in numbers is
 * a reading exercise, not a decision. A scarecrow is steady damage, a beehive
 * hits hard and slowly, a sprinkler barely hurts anything but holds the wave
 * still for the other two.
 *
 * `range` is in whole cells, measured centre to centre. `cool` is ticks between
 * shots. `slow` is how many steps a hit takes off a pest's speed, and it lasts
 * `slowFor` ticks.
 */
export const TOWERS: Record<TowerKind, {
  name: string;
  cost: number;
  range: number;
  damage: number;
  cool: number;
  slow: number;
  slowFor: number;
}> = {
  scarecrow: { name: "Scarecrow", cost: 20, range: 2, damage: 3, cool: 4, slow: 0, slowFor: 0 },
  beehive:   { name: "Beehive",   cost: 45, range: 3, damage: 14, cool: 14, slow: 0, slowFor: 0 },
  sprinkler: { name: "Sprinkler", cost: 30, range: 2, damage: 1, cool: 5, slow: 2, slowFor: 10 },
};

/* ── the pests ────────────────────────────────────────────────────────────── */

export type PestKind = "grub" | "hopper" | "beetle";

/** `speed` is steps per tick, so a grub crosses a cell in four ticks. */
export const PESTS: Record<PestKind, { name: string; hp: number; speed: number; bounty: number }> = {
  grub:   { name: "Grub",   hp: 12, speed: 3, bounty: 2 },
  hopper: { name: "Hopper", hp: 7,  speed: 6, bounty: 3 },
  beetle: { name: "Beetle", hp: 44, speed: 2, bounty: 6 },
};

/**
 * One pest, due through the gate at a given tick.
 *
 * `hp` overrides the kind's own, and is how the ladder is climbed. The first
 * version of this had waves that only ever grew *longer*, and the reference
 * player survived 199 nights out of 199 — towers are permanent and coins
 * accumulate, so a defence that never faces anything tougher outgrows the
 * attack forever. Numbers, not quantity, are what make a night harder.
 */
export type Spawn = { tick: number; kind: PestKind; hp?: number };
export type Wave = Spawn[];

/* ── the replay ───────────────────────────────────────────────────────────── */

/** A pest as it stands at one instant. `at` is in steps along the path. */
export type Mote = { id: number; kind: PestKind; at: number; hp: number; slowed: boolean };

/** A shot fired this tick, for the board to draw a line for. */
export type Shot = { from: number; to: number };

/**
 * One instant, and what happened on it.
 *
 * `died` and `leaked` are reported rather than left to be worked out. The board
 * first derived them by watching pests disappear and guessing from how far
 * along they were — which is a guess, and a guess in the one place where the
 * replay must agree with the result exactly.
 */
export type Frame = {
  tick: number;
  motes: Mote[];
  shots: Shot[];
  /** ids that were stopped on this tick */
  died: number[];
  /** ids that reached the house on this tick */
  leaked: number[];
};

export type NightResult = {
  frames: Frame[];
  /** how many got through to the house */
  leaked: number;
  killed: number;
  /** what the kills paid */
  earned: number;
  /** true if nothing got through */
  held: boolean;
};

/* ── the simulation ───────────────────────────────────────────────────────── */

const cellX = (field: Field, cell: number) => cell % field.w;
const cellY = (field: Field, cell: number) => Math.floor(cell / field.w);

/**
 * Whether a tower can reach a pest, in whole cells.
 *
 * Squared distance, compared against squared range — so no square root, and
 * therefore no float anywhere in the reachability test.
 */
function inRange(field: Field, tower: Tower, atStep: number): boolean {
  const cell = field.path[Math.min(Math.floor(atStep / STEPS), field.path.length - 1)];
  const dx = cellX(field, tower.at) - cellX(field, cell);
  const dy = cellY(field, tower.at) - cellY(field, cell);
  const r = statsOf(tower).range;
  return dx * dx + dy * dy <= r * r;
}

/** How far along the path the house is, in steps. */
export const pathLength = (field: Field) => field.path.length * STEPS;

type Live = {
  id: number;
  kind: PestKind;
  at: number;
  hp: number;
  /** ticks of slow remaining, and how much is being taken off */
  slowLeft: number;
  slowBy: number;
};

/**
 * Play out one night.
 *
 * Pure, and integer throughout. The same field and wave give the same result
 * every time — which is what lets a test name an exact number of leaks, and
 * what lets the balance be measured rather than guessed.
 *
 * There is no seed here, deliberately. Nothing in a night is random: the roll
 * of the dice happens once, in `waveFor`, and by the time the wave arrives it
 * is a fixed list. If a pest ever gains a random anything it takes a seed
 * *then* — an unused parameter kept "for later" is how a signature rots.
 */
export function runNight(field: Field, wave: Wave, maxTicks = 4000): NightResult {
  const frames: Frame[] = [];
  const live: Live[] = [];
  const cools = new Map<number, number>(); // tower index → ticks until it may fire
  const end = pathLength(field);

  let leaked = 0;
  let killed = 0;
  let earned = 0;
  let nextId = 1;
  let spawned = 0;

  const due = [...wave].sort((a, b) => a.tick - b.tick);

  for (let tick = 0; tick < maxTicks; tick++) {
    /* 1. anything due through the gate */
    while (spawned < due.length && due[spawned].tick <= tick) {
      const { kind, hp } = due[spawned];
      live.push({ id: nextId++, kind, at: 0, hp: hp ?? PESTS[kind].hp, slowLeft: 0, slowBy: 0 });
      spawned++;
    }

    /* 2. the towers fire.
       Target the pest furthest along the path — the one closest to getting
       through is the one worth shooting, and picking the nearest instead is
       the classic way to lose a wave while every tower is busy. */
    const shots: Shot[] = [];
    for (let i = 0; i < field.towers.length; i++) {
      const tower = field.towers[i];
      const ready = (cools.get(i) ?? 0) <= 0;
      if (!ready) { cools.set(i, (cools.get(i) ?? 0) - 1); continue; }

      let target: Live | null = null;
      for (const m of live) {
        if (m.hp <= 0) continue;
        if (!inRange(field, tower, m.at)) continue;
        if (!target || m.at > target.at) target = m;
      }
      if (!target) continue;

      const spec = statsOf(tower);
      target.hp -= spec.damage;
      if (spec.slow > 0) { target.slowLeft = spec.slowFor; target.slowBy = spec.slow; }
      shots.push({ from: tower.at, to: target.id });
      cools.set(i, spec.cool);
    }

    /* 3. the dead are counted before anything moves, so a pest killed this
          tick cannot also leak on it */
    const diedNow: number[] = [];
    for (let i = live.length - 1; i >= 0; i--) {
      if (live[i].hp > 0) continue;
      killed++;
      earned += PESTS[live[i].kind].bounty;
      diedNow.push(live[i].id);
      live.splice(i, 1);
    }

    /* 4. everything still standing walks */
    const leakedNow: number[] = [];
    for (let i = live.length - 1; i >= 0; i--) {
      const m = live[i];
      let speed = PESTS[m.kind].speed;
      if (m.slowLeft > 0) { speed = Math.max(1, speed - m.slowBy); m.slowLeft--; }
      m.at += speed;
      if (m.at >= end) { leaked++; leakedNow.push(m.id); live.splice(i, 1); }
    }

    frames.push({
      tick,
      motes: live.map((m) => ({
        id: m.id, kind: m.kind, at: m.at, hp: m.hp, slowed: m.slowLeft > 0,
      })),
      shots,
      died: diedNow,
      leaked: leakedNow,
    });

    /* 5. over when the gate is empty and so is the field */
    if (spawned >= due.length && live.length === 0) break;
  }

  return { frames, leaked, killed, earned, held: leaked === 0 };
}

/* ── waves ────────────────────────────────────────────────────────────────── */

/* mulberry32 — the same seeded PRNG every generator here uses, so a night is
   reproducible and a bad one can be looked at again */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * How much tougher a pest is on night `n`.
 *
 * **Measured, by `scripts/tune-farm.mjs`, and the first number was wrong.**
 *
 * With no toughness at all — waves that only grew *longer* — the reference
 * player survived 199 nights in 199 runs and was still going when the script
 * gave up. Towers are permanent and coins accumulate, so a defence that never
 * meets anything tougher outgrows the attack forever. More of them is not
 * harder; bigger ones are.
 *
 * At 1.18 a night the reference dies:
 *
 *     low 3 · q1 9 · median 10 · q3 11 · high 13   (150 runs)
 *
 * That is the band a run wants — long enough to build something worth losing,
 * short enough to want another go — and a player who actually thinks about
 * placement should beat it comfortably, since the reference only ever buys the
 * best-covered free cell and never upgrades or reacts.
 */
export const toughness = (night: number) => Math.pow(1.18, night - 1);

/**
 * The wave for night `n`, escalating without end.
 *
 * Three dials, and they do different jobs on purpose: `count` and `gap` change
 * how *busy* a night is, `toughness` changes whether the guns are big enough.
 * Only the third one keeps working forever, which is why the first version was
 * flat.
 */
export function waveFor(night: number, seed = 1): Wave {
  const r = rng(seed * 7919 + night);
  const count = 4 + Math.floor(night * 1.6);
  const gap = Math.max(4, 14 - night);
  const tough = toughness(night);
  const wave: Wave = [];

  for (let i = 0; i < count; i++) {
    const roll = r();
    let kind: PestKind = "grub";
    // hoppers from night 2, beetles from night 4, and never all at once
    if (night >= 4 && roll > 0.82) kind = "beetle";
    else if (night >= 2 && roll > 0.55) kind = "hopper";
    wave.push({ tick: i * gap, kind, hp: Math.round(PESTS[kind].hp * tough) });
  }
  return wave;
}

/** What a wave is worth if every last pest is stopped. */
export const waveBounty = (wave: Wave) =>
  wave.reduce((n, s) => n + PESTS[s.kind].bounty, 0);

/* ── the run ──────────────────────────────────────────────────────────────────
   The day, and everything that carries between nights. This is the layer that
   makes placing a tower a decision rather than a formality: the first version
   of the board had them free and unlimited, and with nothing to spend there was
   nothing to weigh up.

   It mirrors the `Run` above `State` in Free-Atro — the meta layer that owns
   the money, sitting over a single night's simulation, which owns none of it.
── */

export type Run = {
  night: number;
  coins: number;
  lives: number;
  towers: Tower[];
  /** every night's leak count, so a run has a shape and not just a number */
  history: number[];
  over: boolean;
};

export const START_COINS = 60;
export const START_LIVES = 5;
/** What the farm pays each morning regardless — the floor under a bad night. */
export const STIPEND = 14;

export const newRun = (): Run => ({
  night: 1,
  coins: START_COINS,
  lives: START_LIVES,
  towers: [],
  history: [],
  over: false,
});

/** Every function below returns the same object when nothing happened, so a
 *  caller can compare by identity to know whether the tap did anything. */

export function build(run: Run, at: number, kind: TowerKind, path: number[]): Run {
  if (run.over) return run;
  if (path.includes(at)) return run;
  if (run.towers.some((t) => t.at === at)) return run;
  const cost = TOWERS[kind].cost;
  if (run.coins < cost) return run;
  return { ...run, coins: run.coins - cost, towers: [...run.towers, { at, kind, level: 1 }] };
}

export function upgrade(run: Run, at: number): Run {
  if (run.over) return run;
  const t = run.towers.find((x) => x.at === at);
  if (!t) return run;
  const cost = upgradeCost(t);
  if (cost === null || run.coins < cost) return run;
  return {
    ...run,
    coins: run.coins - cost,
    towers: run.towers.map((x) => (x.at === at ? { ...x, level: x.level + 1 } : x)),
  };
}

export function sell(run: Run, at: number): Run {
  if (run.over) return run;
  const t = run.towers.find((x) => x.at === at);
  if (!t) return run;
  return {
    ...run,
    coins: run.coins + sellValue(t),
    towers: run.towers.filter((x) => x.at !== at),
  };
}

/**
 * Take a night's outcome and move the run on.
 *
 * Lives never come back. A run that has ended stays ended — `over` is sticky,
 * so a late call cannot revive it.
 */
export function settle(run: Run, result: NightResult): Run {
  if (run.over) return run;
  const lives = Math.max(0, run.lives - result.leaked);
  return {
    ...run,
    night: run.night + 1,
    coins: run.coins + result.earned + STIPEND,
    lives,
    history: [...run.history, result.leaked],
    over: lives === 0,
  };
}

/** How far a run got — the score, for an endless game. */
export const nightsSurvived = (run: Run) => run.history.length;
