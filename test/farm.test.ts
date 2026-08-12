import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PESTS,
  STEPS,
  TOWERS,
  pathLength,
  runNight,
  waveBounty,
  waveFor,
  type Field,
  type Wave,
} from "../src/games/farm/engine.ts";

/**
 * A small field with a straight path along the top row, so the geometry in a
 * failure message is readable: cells 0..7 are the path, everything below is
 * free ground.
 */
const field = (towers: Field["towers"] = []): Field => ({
  w: 8,
  h: 6,
  path: [0, 1, 2, 3, 4, 5, 6, 7],
  towers,
});

const wave = (...kinds: ("grub" | "hopper" | "beetle")[]): Wave =>
  kinds.map((kind, i) => ({ tick: i * 10, kind }));

/* ── the night is a function ──────────────────────────────────────────────── */

test("the same field and wave give the same night twice", () => {
  // the whole architecture rests on this: the outcome is settled before a
  // single frame is drawn, so the replay and the result can never disagree
  const f = field([{ at: 8, kind: "scarecrow", level: 1 }, { at: 12, kind: "beehive", level: 1 }]);
  const w = waveFor(6, 42);
  const a = runNight(f, w);
  const b = runNight(f, w);
  assert.deepEqual(a.frames, b.frames);
  assert.deepEqual([a.leaked, a.killed, a.earned], [b.leaked, b.killed, b.earned]);
});

test("an undefended field leaks the whole wave and kills nothing", () => {
  const w = wave("grub", "grub", "hopper");
  const r = runNight(field(), w);
  assert.equal(r.leaked, 3);
  assert.equal(r.killed, 0);
  assert.equal(r.earned, 0);
  assert.ok(!r.held);
});

test("enough guns and nothing gets through", () => {
  const towers = [8, 9, 10, 11, 12, 13].map((at) => ({ at, kind: "scarecrow" as const, level: 1 }));
  const r = runNight(field(towers), wave("grub", "grub"));
  assert.equal(r.leaked, 0);
  assert.equal(r.killed, 2);
  assert.ok(r.held);
  assert.equal(r.earned, PESTS.grub.bounty * 2);
});

test("a tower out of reach never fires a shot", () => {
  // the path is the top row; this one sits five rows below it, well past its
  // range of two
  const far = field([{ at: 8 * 5 + 0, kind: "scarecrow", level: 1 }]);
  const r = runNight(far, wave("grub"));
  assert.equal(r.leaked, 1);
  assert.equal(r.frames.reduce((n, f) => n + f.shots.length, 0), 0, "it should have stayed quiet");
});

test("a pest killed on the doorstep does not also get in", () => {
  /*
   * The order inside a tick is load-bearing: the dead are counted before
   * anything walks, so a pest that dies on the tick it would have reached the
   * house counts once, as a kill. Counting movement first would have let it
   * leak *and* pay a bounty.
   */
  const towers = [8, 9, 10, 11, 12, 13, 14, 15].map((at) => ({ at, kind: "beehive" as const, level: 1 }));
  const r = runNight(field(towers), wave("grub"));
  assert.equal(r.killed + r.leaked, 1, "it was counted exactly once");
  assert.equal(r.leaked, 0);
});

/* ── the rules of movement ────────────────────────────────────────────────── */

test("a pest walks its own speed and no faster", () => {
  const r = runNight(field(), wave("grub"));
  const first = r.frames[0].motes[0];
  assert.equal(first.at, PESTS.grub.speed, "one tick of walking");
  const second = r.frames[1].motes[0];
  assert.equal(second.at, PESTS.grub.speed * 2);
});

test("a hopper reaches the house sooner than a grub", () => {
  const grub = runNight(field(), wave("grub"));
  const hopper = runNight(field(), wave("hopper"));
  assert.ok(hopper.frames.length < grub.frames.length, "faster means fewer ticks");
});

test("the field is exactly as long as the path says", () => {
  assert.equal(pathLength(field()), 8 * STEPS);
});

/* ── the sprinkler ────────────────────────────────────────────────────────── */

test("a sprinkler holds a pest up without killing it", () => {
  const wet = field([{ at: 8, kind: "sprinkler", level: 1 }]);
  const dry = runNight(field(), wave("grub"));
  const slowed = runNight(wet, wave("grub"));
  assert.ok(slowed.frames.length > dry.frames.length, "it took longer to cross");
  assert.ok(slowed.frames.some((f) => f.motes.some((m) => m.slowed)), "and it showed");
});

test("a slow can never stop a pest dead", () => {
  // otherwise a single sprinkler is an unbreakable wall and the game is over
  const wet = field([
    { at: 8, kind: "sprinkler", level: 1 }, { at: 9, kind: "sprinkler", level: 1 }, { at: 10, kind: "sprinkler", level: 1 },
  ]);
  const r = runNight(wet, wave("beetle"));
  const walked = r.frames.map((f) => f.motes[0]?.at ?? Infinity);
  for (let i = 1; i < walked.length; i++) {
    if (walked[i] === Infinity || walked[i - 1] === Infinity) continue;
    assert.ok(walked[i] > walked[i - 1], "it kept moving");
  }
});

/* ── the replay ───────────────────────────────────────────────────────────── */

test("the replay ends when the field is empty, not when the clock runs out", () => {
  const r = runNight(field(), wave("grub"));
  assert.ok(r.frames.length < 100, `took ${r.frames.length} frames`);
  assert.equal(r.frames[r.frames.length - 1].motes.length, 0, "nothing left standing");
});

test("every shot names a pest that was there to be shot", () => {
  const f = field([{ at: 8, kind: "scarecrow", level: 1 }, { at: 11, kind: "beehive", level: 1 }]);
  const r = runNight(f, waveFor(5, 3));
  for (const frame of r.frames) {
    for (const shot of frame.shots) {
      assert.ok(
        frame.motes.some((m) => m.id === shot.to) ||
          r.frames.some((g) => g.motes.some((m) => m.id === shot.to)),
        `shot at ${shot.to}, which never existed`
      );
      assert.ok(f.towers.some((t) => t.at === shot.from), "fired from somewhere with no tower");
    }
  }
});

test("nothing is ever counted twice", () => {
  const f = field([{ at: 8, kind: "scarecrow", level: 1 }, { at: 13, kind: "scarecrow", level: 1 }]);
  const w = waveFor(7, 11);
  const r = runNight(f, w);
  assert.equal(r.killed + r.leaked, w.length, "every pest ended up exactly one way");
});

/* ── the ladder ───────────────────────────────────────────────────────────── */

test("later nights bring more, and the gaps close", () => {
  const early = waveFor(1, 5);
  const late = waveFor(10, 5);
  assert.ok(late.length > early.length, "more of them");
  const gap = (w: Wave) => (w.length > 1 ? w[1].tick - w[0].tick : Infinity);
  assert.ok(gap(late) < gap(early), "and closer together");
});

test("the hard pests wait their turn", () => {
  for (let n = 1; n <= 3; n++) {
    assert.ok(!waveFor(n, 9).some((s) => s.kind === "beetle"), `beetles on night ${n}`);
  }
  assert.ok(!waveFor(1, 9).some((s) => s.kind === "hopper"), "hoppers on night one");
});

test("a wave is the same wave every time it is asked for", () => {
  assert.deepEqual(waveFor(8, 4), waveFor(8, 4));
  assert.notDeepEqual(waveFor(8, 4), waveFor(8, 5), "a different seed is a different night");
});

test("what a wave pays is what stopping all of it earns", () => {
  const towers = Array.from({ length: 16 }, (_, i) => ({ at: 8 + i, kind: "beehive" as const, level: 1 }));
  const w = waveFor(3, 2);
  const r = runNight(field(towers), w);
  assert.equal(r.leaked, 0, "this many beehives should hold night three");
  assert.equal(r.earned, waveBounty(w));
});

/* ── the shape of the numbers ─────────────────────────────────────────────── */

test("the three towers do genuinely different jobs", () => {
  // a shop of near-identical options is a reading exercise, not a decision
  const [s, b, p] = [TOWERS.scarecrow, TOWERS.beehive, TOWERS.sprinkler];
  assert.ok(b.damage > s.damage * 3, "the beehive hits far harder");
  assert.ok(b.cool > s.cool * 2, "and far more slowly");
  assert.ok(p.slow > 0 && s.slow === 0 && b.slow === 0, "only the sprinkler holds anything up");
  assert.ok(p.damage < s.damage, "and it is not there for its damage");
});
