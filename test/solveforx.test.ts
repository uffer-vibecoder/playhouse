import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PROBLEMS,
  backspace,
  check,
  clear,
  generate,
  initialState,
  isRight,
  isSolvedPuzzle,
  render,
  rightCount,
  shareGrid,
  step,
  toSave,
  recordFirstScore,
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

/* ── the first attempt ───────────────────────────────────────────────────── */

test("the first attempt's score is recorded once every row is answered", () => {
  const problems = generate(puz(21));
  let s = initialState();
  problems.forEach((p, i) => {
    // get one deliberately wrong, so this is not just the perfect case
    s = enter({ ...s, cursor: i }, String(i === 3 ? p.x + 1 : p.x));
    s = recordFirstScore(problems, s);
    if (i < PROBLEMS - 1) {
      assert.equal(s.firstScore, null, `closed at row ${i} with rows still blank`);
    }
  });
  assert.equal(s.firstScore, PROBLEMS - 1);
});

test("a wrong-but-complete attempt still counts as an attempt", () => {
  // averaging only successful attempts would flatter the number
  const problems = generate(puz(22));
  let s = initialState();
  problems.forEach((_, i) => {
    s = enter({ ...s, cursor: i }, "0");
  });
  s = recordFirstScore(problems, s);
  assert.notEqual(s.firstScore, null);
});

test("replaying a set never changes the first score", () => {
  const problems = generate(puz(23));
  let s = initialState();
  problems.forEach((p, i) => {
    s = enter({ ...s, cursor: i }, String(p.x + 1)); // all wrong
  });
  s = recordFirstScore(problems, s);
  const first = s.firstScore;
  assert.equal(first, 0);

  s = clear(s); // redo
  assert.equal(s.firstScore, first, "clearing must not erase the first attempt");
  problems.forEach((p, i) => {
    s = enter({ ...s, cursor: i }, String(p.x)); // now all right
    s = recordFirstScore(problems, s);
  });
  assert.equal(s.firstScore, first, "a perfect replay must not overwrite it");
  assert.equal(rightCount(problems, s), PROBLEMS, "the replay itself did score ten");
});

test("a first score survives a save and restore", () => {
  const problems = generate(puz(24));
  let s = initialState();
  problems.forEach((p, i) => {
    s = enter({ ...s, cursor: i }, String(p.x));
    s = recordFirstScore(problems, s);
  });
  const restored = initialState(toSave(s));
  assert.equal(restored.firstScore, PROBLEMS);
});

test("a nonsense first score in a save is discarded", () => {
  for (const bad of [-1, 99, 3.5, "seven" as unknown as number]) {
    const s = initialState({ answers: [], firstScore: bad });
    assert.equal(s.firstScore, null, `accepted ${bad}`);
  }
});

/* ── the harder tiers ─────────────────────────────────────────────────────── */

import { readFileSync } from "node:fs";
import { renderPieces, typePoint, type Tier } from "../src/games/solveforx/engine.ts";
import puzzleFile from "../src/data/solveforx.json" with { type: "json" };

/**
 * The regression that matters more than any other in this file.
 *
 * The archive stores a seed and nothing else, so an edit to the easy generator
 * changes the equations behind ids people have already answered — their saved
 * answers would restore onto problems that no longer exist. 1200 equations,
 * captured before the harder tiers were written.
 */
test("every shipped easy set is exactly what it was", () => {
  const snap = JSON.parse(readFileSync("test/solveforx.snapshot.json", "utf8"));
  assert.equal(snap.length, 120);
  for (const set of snap) {
    const puzzle = (puzzleFile as { id: string; seed: number }[]).find((p) => p.id === set.id)!;
    const now = generate(puzzle);
    assert.equal(now.length, set.problems.length, set.id);
    now.forEach((p, i) => {
      assert.equal(render(p), set.problems[i].eq, `${set.id} #${i + 1}`);
      assert.equal(p.x, set.problems[i].x, `${set.id} #${i + 1} answer`);
    });
  }
});

const sample = (tier: Tier, n = 250) =>
  Array.from({ length: n }, (_, i) => generate({ id: `T-${i}`, seed: 90001 + i * 37, tier }));

for (const tier of ["medium", "hard"] as Tier[]) {
  test(`${tier}: every equation balances when the answer is put back`, () => {
    for (const problems of sample(tier)) {
      assert.equal(problems.length, PROBLEMS);
      for (const p of problems) {
        // the exact fraction is the answer; check it against the equation's
        // own coefficients rather than against the float
        assert.ok(p.q !== undefined && p.n !== undefined, `${p.form} carries no fraction`);
        assert.ok(p.q! > 0, "denominator normalised positive");
        const x = p.n! / p.q!;
        const v = p.v ?? "x";
        const d = p.d ?? 0;
        const e = p.e ?? 0;
        let left: number, right: number;
        switch (p.form) {
          case "like-terms": left = p.a * x + p.b + p.c * x; right = d; break;
          case "flip":       left = p.c; right = p.a * x + p.b * x; break;
          case "dist-sum":   left = p.a * (p.b + p.c * x); right = d; break;
          case "dist-diff":  left = p.a * (p.b * x - p.c); right = d; break;
          case "dist-outer": left = d; right = p.b + p.a * (x - p.c); break;
          case "collect":    left = p.a * x + p.b + p.c; right = d; break;
          case "both-sides": left = p.a * (p.b * x + p.c); right = d + e * x; break;
          case "over":       left = (p.b + x) / p.a; right = p.c; break;
          case "minus-over": left = (p.b - x) / p.a; right = p.c; break;
          case "frac-coef":  left = (p.a / p.b) * x - p.c; right = d; break;
          case "frac-outer": left = p.c + (p.a / p.b) * x; right = d; break;
          case "steep":      left = p.a * x - p.b; right = p.c; break;
          default: throw new Error(`unexpected form ${p.form} for ${v}`);
        }
        assert.ok(
          Math.abs(left - right) < 1e-9,
          `${p.form}: ${render(p)} does not balance at x = ${x}`
        );
      }
    }
  });

  test(`${tier}: the variable never cancels out`, () => {
    for (const problems of sample(tier)) {
      for (const p of problems) {
        assert.ok(Number.isFinite(p.x), `${render(p)} has no single answer`);
      }
    }
  });

  test(`${tier}: nothing renders a stray double sign`, () => {
    for (const problems of sample(tier, 60)) {
      for (const p of problems) {
        const eq = render(p);
        assert.ok(!/[+−] *[+−] *[+−]/.test(eq), `${eq} stacks signs`);
        assert.ok(!eq.includes("undefined"), `${eq} has a hole in it`);
        assert.ok(eq.includes("="), `${eq} is not an equation`);
      }
    }
  });
}

test("a third is satisfied by two decimals or by three, but not by the wrong one", () => {
  const third: Problem = { form: "steep", a: 3, b: 0, c: 1, n: 1, q: 3, x: 1 / 3 };
  assert.ok(isRight(third, "0.33"), "two places is what the worksheet asks for");
  assert.ok(isRight(third, "0.333"), "more precision is not an error");
  assert.ok(!isRight(third, "0.34"), "a different number is a different number");
  assert.ok(!isRight(third, "0.3"), "one place is outside half a hundredth");
});

test("the easy tier stays exact, so nearly-right is still wrong", () => {
  const [p] = generate({ id: "E", seed: 4242 });
  assert.ok(isRight(p, String(p.x)));
  assert.ok(!isRight(p, String(p.x + 0.001)), "no tolerance where answers are whole");
});

test("a blank, a lone minus and a lone point are not answers", () => {
  const p: Problem = { form: "steep", a: 2, b: 0, c: 4, n: 2, q: 1, x: 2 };
  for (const junk of ["", " ", "-", ".", "-."]) assert.ok(!isRight(p, junk), `"${junk}"`);
});

test("a decimal answer survives a reload", () => {
  const restored = initialState({ answers: ["-1.43", "0.72", "45", "", "0.33", "", "", "", "", ""] });
  assert.equal(restored.answers[0], "-1.43", "the old guard would have eaten this");
  assert.equal(restored.answers[1], "0.72");
  assert.equal(restored.answers[4], "0.33");
});

test("the point goes in once, and never first", () => {
  let s = initialState();
  s = typePoint(s);
  assert.equal(s.answers[0], "", "nothing to put a point after yet");
  s = typeDigit(s, "1");
  s = typePoint(s);
  s = typePoint(s);
  assert.equal(s.answers[0], "1.", "one point only");
  s = typeDigit(s, "4");
  s = typeDigit(s, "3");
  s = typeDigit(s, "9");
  assert.equal(s.answers[0], "1.43", "two places, then it stops");
});

test("hard sets stack their fractions rather than setting them inline", () => {
  const problems = generate({ id: "H", seed: 777, tier: "hard" });
  const stacked = problems.filter((p) => renderPieces(p).some((piece) => piece.kind === "frac"));
  assert.ok(stacked.length > 0, "the hard tier is fractions or it is nothing");
  for (const p of stacked) {
    for (const piece of renderPieces(p)) {
      if (piece.kind === "frac") {
        assert.ok(piece.over.length > 0 && piece.under.length > 0, render(p));
      }
    }
  }
});
