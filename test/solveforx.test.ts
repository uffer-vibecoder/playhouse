import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PROBLEMS,
  backspace,
  check,
  generate,
  initialState,
  isRight,
  isSolvedPuzzle,
  render,
  rightCount,
  shareGrid,
  step,
  toggleSign,
  typeDigit,
  type Problem,
  type Puzzle,
  type State,
} from "../src/games/solveforx/engine.ts";

const puz = (seed: number): Puzzle => ({ id: "SX-TEST", seed });

/** Type a whole answer into the row under the cursor. */
const enter = (s: State, text: string) => {
  let next = s;
  for (const ch of text) next = ch === "-" ? toggleSign(next) : typeDigit(next, ch);
  return next;
};

/** Fill every row with the correct answer. */
const solveAll = (problems: Problem[]) => {
  let s = initialState();
  problems.forEach((p, i) => {
    s = enter({ ...s, cursor: i }, String(p.x));
  });
  return s;
};

/* ── generation ──────────────────────────────────────────────────────────── */

test("a seed always produces the same ten problems", () => {
  const a = generate(puz(4242));
  const b = generate(puz(4242));
  assert.equal(a.length, PROBLEMS);
  assert.deepEqual(a, b);
});

test("different seeds produce different problems", () => {
  assert.notDeepEqual(generate(puz(1)), generate(puz(2)));
});

test("every answer is a whole number, across many seeds", () => {
  for (let seed = 1; seed <= 400; seed++) {
    for (const p of generate(puz(seed))) {
      assert.ok(Number.isInteger(p.x), `seed ${seed}: x=${p.x} is not an integer`);
    }
  }
});

test("every equation actually balances at x", () => {
  // The generator builds forwards, so this is the check that it built what it
  // claims: substituting x back in must reproduce c exactly.
  for (let seed = 1; seed <= 400; seed++) {
    for (const p of generate(puz(seed))) {
      const lhs =
        p.form === "add" ? p.x + p.b
        : p.form === "sub" ? p.x - p.b
        : p.form === "mul" ? p.a * p.x
        : p.form === "div" ? p.x / p.a
        : p.form === "mul-add" ? p.a * p.x + p.b
        : p.a * p.x - p.b;
      assert.equal(lhs, p.c, `seed ${seed}: ${render(p)} does not hold at x=${p.x}`);
    }
  }
});

test("division never asks for a fraction", () => {
  for (let seed = 1; seed <= 400; seed++) {
    for (const p of generate(puz(seed))) {
      if (p.form === "div") assert.equal(p.x % p.a, 0, `seed ${seed}: ${render(p)}`);
    }
  }
});

test("the first four problems are always one-step", () => {
  for (let seed = 1; seed <= 200; seed++) {
    for (const p of generate(puz(seed)).slice(0, 4)) {
      assert.ok(!p.form.startsWith("mul-"), `seed ${seed}: ${p.form} appeared early`);
    }
  }
});

test("answers stay in a friendly range", () => {
  for (let seed = 1; seed <= 400; seed++) {
    for (const p of generate(puz(seed))) {
      assert.ok(p.x >= 1 && p.x <= 60, `seed ${seed}: x=${p.x} is unfriendly`);
      assert.ok(p.c >= 0, `seed ${seed}: ${render(p)} has a negative right-hand side`);
    }
  }
});

test("rendering reads as algebra", () => {
  assert.equal(render({ form: "add", a: 1, b: 7, c: 12, x: 5 }), "x + 7 = 12");
  assert.equal(render({ form: "mul-add", a: 3, b: 4, c: 19, x: 5 }), "3x + 4 = 19");
  assert.equal(render({ form: "div", a: 3, b: 0, c: 5, x: 15 }), "x ÷ 3 = 5");
});

/* ── entry ───────────────────────────────────────────────────────────────── */

test("digits land in the row under the cursor", () => {
  let s = initialState();
  s = enter(s, "42");
  assert.equal(s.answers[0], "42");
  s = enter(step(s, 1), "7");
  assert.equal(s.answers[1], "7");
  assert.equal(s.answers[0], "42", "the first row must not be disturbed");
});

test("the sign toggles rather than being typed", () => {
  let s = enter(initialState(), "5");
  s = toggleSign(s);
  assert.equal(s.answers[0], "-5");
  s = toggleSign(s);
  assert.equal(s.answers[0], "5");
});

test("backspace never underflows, and non-digits are ignored", () => {
  let s = enter(initialState(), "9");
  s = backspace(backspace(s));
  assert.equal(s.answers[0], "");
  assert.equal(typeDigit(s, "x").answers[0], "");
});

test("the cursor wraps in both directions", () => {
  const s = initialState();
  assert.equal(step(s, -1).cursor, PROBLEMS - 1);
  assert.equal(step({ ...s, cursor: PROBLEMS - 1 }, 1).cursor, 0);
});

/* ── checking ────────────────────────────────────────────────────────────── */

test("check marks answered-but-wrong rows and leaves blanks alone", () => {
  const problems = generate(puz(7));
  let s = initialState();
  s = enter({ ...s, cursor: 0 }, String(problems[0].x)); // right
  s = enter({ ...s, cursor: 1 }, String(problems[1].x + 1)); // wrong
  s = check(problems, { ...s, cursor: 0 });
  assert.ok(!s.wrong.has(0));
  assert.ok(s.wrong.has(1));
  assert.ok(!s.wrong.has(2), "an untouched row is not a mistake yet");
});

test("a correct answer is recognised however it was typed", () => {
  const p: Problem = { form: "add", a: 1, b: 7, c: 12, x: 5 };
  assert.ok(isRight(p, "5"));
  assert.ok(!isRight(p, ""));
  assert.ok(!isRight(p, "6"));
  assert.ok(!isRight(p, "-5"));
});

test("filling every row correctly solves the puzzle", () => {
  const problems = generate(puz(99));
  const s = solveAll(problems);
  assert.equal(rightCount(problems, s), PROBLEMS);
  assert.ok(isSolvedPuzzle(problems, s));
});

test("one wrong row is not a solve", () => {
  const problems = generate(puz(99));
  const s = solveAll(problems);
  const spoiled = { ...s, answers: s.answers.map((a, i) => (i === 3 ? "0" : a)) };
  assert.ok(!isSolvedPuzzle(problems, spoiled));
  assert.equal(rightCount(problems, spoiled), PROBLEMS - 1);
});

/* ── restoring and sharing ───────────────────────────────────────────────── */

test("restoring keeps valid answers and discards junk", () => {
  const s = initialState({
    answers: ["12", "-3", "notanumber", "4", "999999", "", "7", "8", "9", "10"],
  });
  assert.equal(s.answers[0], "12");
  assert.equal(s.answers[1], "-3");
  assert.equal(s.answers[2], "", "junk must not be restored");
  assert.equal(s.answers[4], "", "an absurd value must not be restored");
  assert.equal(s.answers.length, PROBLEMS);
});

test("the share grid reports the score and carries no answers", () => {
  const problems = generate(puz(99));
  const s = solveAll(problems);
  const grid = shareGrid(puz(99), problems, s, "Playhouse");
  assert.match(grid, /10\/10/);
  assert.match(grid, /🟩{10}/u);
  for (const p of problems) {
    assert.ok(!grid.includes(`= ${p.x}`), "an answer leaked into the share text");
  }
});

test("the archive's seeds are all distinct", async () => {
  const { default: archive } = await import("../src/data/solveforx.json", {
    with: { type: "json" },
  });
  const seeds = new Set((archive as Puzzle[]).map((p) => p.seed));
  assert.equal(seeds.size, (archive as Puzzle[]).length);
  assert.ok(seeds.size > 0);
});
