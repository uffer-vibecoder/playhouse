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
};

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

export type Frame = { tick: number; motes: Mote[]; shots: Shot[] };

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
  const r = TOWERS[tower.kind].range;
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

      const spec = TOWERS[tower.kind];
      target.hp -= spec.damage;
      if (spec.slow > 0) { target.slowLeft = spec.slowFor; target.slowBy = spec.slow; }
      shots.push({ from: tower.at, to: target.id });
      cools.set(i, spec.cool);
    }

    /* 3. the dead are counted before anything moves, so a pest killed this
          tick cannot also leak on it */
    for (let i = live.length - 1; i >= 0; i--) {
      if (live[i].hp > 0) continue;
      killed++;
      earned += PESTS[live[i].kind].bounty;
      live.splice(i, 1);
    }

    /* 4. everything still standing walks */
    for (let i = live.length - 1; i >= 0; i--) {
      const m = live[i];
      let speed = PESTS[m.kind].speed;
      if (m.slowLeft > 0) { speed = Math.max(1, speed - m.slowBy); m.slowLeft--; }
      m.at += speed;
      if (m.at >= end) { leaked++; live.splice(i, 1); }
    }

    frames.push({
      tick,
      motes: live.map((m) => ({
        id: m.id, kind: m.kind, at: m.at, hp: m.hp, slowed: m.slowLeft > 0,
      })),
      shots,
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
