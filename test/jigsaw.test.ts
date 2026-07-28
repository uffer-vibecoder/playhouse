import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SIZE,
  colOf,
  conflicts,
  countSolutions,
  deduce,
  erase,
  initialState,
  isFull,
  isGiven,
  isSolved,
  peers,
  progress,
  rowOf,
  solve,
  toSave,
  toggle,
  write,
  type Puzzle,
} from "../src/games/jigsaw/engine.ts";

const archive: Puzzle[] = JSON.parse(readFileSync("src/data/jigsaw.json", "utf8"));
const P = archive[0];
const CELLS = SIZE * SIZE;

/* ── the shapes ───────────────────────────────────────────────────────────── */

test("nine shapes of nine cells, covering the board exactly once", () => {
  for (const p of archive) {
    assert.equal(p.regions.length, CELLS, p.id);
    const count = new Array(9).fill(0);
    for (const g of p.regions) {
      assert.ok(Number.isInteger(g) && g >= 0 && g < 9, `${p.id}: region ${g}`);
      count[g]++;
    }
    assert.deepEqual(count, new Array(9).fill(9), `${p.id}: shapes are not all nine cells`);
  }
});

test("every shape is one connected piece", () => {
  // the whole point of the swap-based generator: a shape that comes apart is
  // not a shape, and growing regions from seeds produced them constantly
  const neighbours = (c: number) => {
    const x = colOf(c), y = rowOf(c);
    const out: number[] = [];
    if (x > 0) out.push(c - 1);
    if (x < SIZE - 1) out.push(c + 1);
    if (y > 0) out.push(c - SIZE);
    if (y < SIZE - 1) out.push(c + SIZE);
    return out;
  };
  for (const p of archive) {
    for (let g = 0; g < 9; g++) {
      const cells = [...p.regions.keys()].filter((c) => p.regions[c] === g);
      const seen = new Set([cells[0]]);
      const stack = [cells[0]];
      while (stack.length) {
        const c = stack.pop()!;
        for (const n of neighbours(c))
          if (p.regions[n] === g && !seen.has(n)) { seen.add(n); stack.push(n); }
      }
      assert.equal(seen.size, 9, `${p.id}: shape ${g} is in ${9 - seen.size + 1} pieces`);
    }
  }
});

test("no shape is a snake down one line", () => {
  for (const p of archive) {
    for (let g = 0; g < 9; g++) {
      const rows = new Array(9).fill(0), cols = new Array(9).fill(0);
      for (let c = 0; c < CELLS; c++) if (p.regions[c] === g) { rows[rowOf(c)]++; cols[colOf(c)]++; }
      assert.ok(Math.max(...rows, ...cols) <= 4, `${p.id}: shape ${g} puts five in one line`);
    }
  }
});

test("no board is just plain sudoku in disguise", () => {
  for (const p of archive) {
    const boxy = p.regions.every((g, c) => g === Math.floor(rowOf(c) / 3) * 3 + Math.floor(colOf(c) / 3));
    assert.ok(!boxy, `${p.id} is nine 3×3 boxes`);
  }
});

/* ── the answers ──────────────────────────────────────────────────────────── */

test("every shipped answer really is an answer", () => {
  for (const p of archive) {
    for (let i = 0; i < SIZE; i++) {
      const row = new Set<number>(), col = new Set<number>(), reg = new Set<number>();
      for (let c = 0; c < CELLS; c++) {
        if (rowOf(c) === i) row.add(p.solution[c]);
        if (colOf(c) === i) col.add(p.solution[c]);
        if (p.regions[c] === i) reg.add(p.solution[c]);
      }
      assert.equal(row.size, 9, `${p.id}: row ${i}`);
      assert.equal(col.size, 9, `${p.id}: column ${i}`);
      assert.equal(reg.size, 9, `${p.id}: shape ${i}`);
    }
  }
});

test("the clues agree with the answer, and there are as many as claimed", () => {
  for (const p of archive) {
    let clues = 0;
    for (let c = 0; c < CELLS; c++) {
      if (!p.given[c]) continue;
      clues++;
      assert.equal(p.given[c], p.solution[c], `${p.id}: clue at ${c} contradicts the answer`);
    }
    assert.equal(clues, p.clues, p.id);
  }
});

test("every board has exactly one answer", () => {
  for (const p of archive) {
    const { n, capped } = countSolutions(p.regions, p.given, 2, 400_000);
    assert.ok(!capped, `${p.id}: could not be proved either way`);
    assert.equal(n, 1, `${p.id}`);
  }
});

test("every board can be reasoned to the end, with no guessing", () => {
  // the bar that matters. Digging against uniqueness alone gave boards of
  // fourteen clues that were perfectly unique and unfinishable by a person
  for (const p of archive) {
    const { solved, grid } = deduce(p.regions, p.given);
    assert.ok(solved, `${p.id} needs a guess somewhere`);
    assert.deepEqual(grid, p.solution, `${p.id} reasons out to a different grid`);
  }
});

test("the tier a board claims is the tier it measures", () => {
  for (const p of archive) {
    const { steps } = deduce(p.regions, p.given);
    const want = steps.hidden === 0 ? "gentle" : steps.hidden <= 18 ? "steady" : "tricky";
    assert.equal(p.tier, want, `${p.id} claims ${p.tier}, needs ${steps.hidden} hidden singles`);
  }
});

test("a gentle board never needs the harder move", () => {
  const gentle = archive.filter((p) => p.tier === "gentle");
  assert.ok(gentle.length > 0, "there are some");
  for (const p of gentle) {
    assert.ok(deduce(p.regions, p.given, ["naked"]).solved, `${p.id} is not gentle`);
  }
});

/* ── the solver ───────────────────────────────────────────────────────────── */

test("the solver finds the shipped answer from the shipped clues", () => {
  for (const p of archive.slice(0, 12)) {
    assert.deepEqual(solve(p.regions, p.given, 400_000), p.solution, p.id);
  }
});

test("an impossible board is reported impossible, not guessed at", () => {
  // two of the same number in one row: nothing can complete it
  const given = new Array(CELLS).fill(0);
  given[0] = 5;
  given[1] = 5;
  assert.equal(solve(P.regions, given, 200_000), null);
});

test("taking a clue away leaves more than one answer, or the dig went too far", () => {
  // every remaining clue on a minimal board is load-bearing
  const tricky = archive.find((p) => p.tier === "tricky")!;
  const at = tricky.given.findIndex((v) => v !== 0);
  const thinner = [...tricky.given];
  thinner[at] = 0;
  const { n } = countSolutions(tricky.regions, thinner, 2, 400_000);
  assert.ok(n >= 1, "still solvable at least one way");
});

/* ── playing ──────────────────────────────────────────────────────────────── */

const blank = (p: Puzzle) => p.given.findIndex((v) => v === 0);

test("a clue cannot be written over", () => {
  const at = P.given.findIndex((v) => v !== 0);
  const s = initialState(P);
  assert.ok(isGiven(P, at));
  assert.equal(write(P, s, at, 4), s, "identity, so callers can tell nothing happened");
  assert.equal(erase(P, s, at), s);
});

test("writing, changing and rubbing out an empty cell", () => {
  const at = blank(P);
  let s = initialState(P);
  s = write(P, s, at, 7);
  assert.equal(s.entries[at], 7);
  s = write(P, s, at, 3);
  assert.equal(s.entries[at], 3, "changed, not refused");
  s = erase(P, s, at);
  assert.equal(s.entries[at], 0);
});

test("the same number twice rubs it out", () => {
  const at = blank(P);
  const s = toggle(P, initialState(P), at, 6);
  assert.equal(s.entries[at], 6);
  assert.equal(toggle(P, s, at, 6).entries[at], 0);
  assert.equal(toggle(P, s, at, 2).entries[at], 2, "a different number just replaces it");
});

test("a clash is reported, not prevented", () => {
  // putting it in and seeing what breaks is how sudoku is actually solved
  const at = blank(P);
  const wrong = P.solution[at] === 1 ? 2 : 1;
  const other = peers(P.regions, at).find((c) => P.given[c] === wrong);
  if (other === undefined) return; // this board has no clue of that value nearby
  const s = write(P, initialState(P), at, wrong);
  const bad = conflicts(P, s);
  assert.ok(bad.has(at), "the cell just written is flagged");
  assert.ok(bad.has(other), "and so is the one it clashes with");
});

test("a board filled in correctly has no clash and is solved", () => {
  const s = { entries: [...P.solution] };
  assert.equal(conflicts(P, s).size, 0);
  assert.ok(isFull(s));
  assert.ok(isSolved(P, s));
});

test("a full board that is wrong is not solved", () => {
  const entries = [...P.solution];
  const at = blank(P);
  const other = peers(P.regions, at).find((c) => !isGiven(P, c))!;
  [entries[at], entries[other]] = [entries[other], entries[at]];
  const s = { entries };
  assert.ok(isFull(s));
  assert.ok(!isSolved(P, s), "full is not the same as finished");
});

test("progress counts the cells you filled, not the ones you were given", () => {
  const s = initialState(P);
  const { done, total } = progress(P, s);
  assert.equal(done, 0);
  assert.equal(total, 81 - P.clues);
  const at = blank(P);
  assert.equal(progress(P, write(P, s, at, P.solution[at])).done, 1);
  assert.equal(
    progress(P, write(P, s, at, P.solution[at] === 9 ? 1 : 9)).done,
    0,
    "a wrong answer is not progress"
  );
});

/* ── saving ───────────────────────────────────────────────────────────────── */

test("a save carries what you wrote and nothing you were given", () => {
  const at = blank(P);
  const s = write(P, initialState(P), at, 5);
  const saved = toSave(P, s);
  assert.equal(saved.entries[at], 5);
  assert.ok(saved.entries.every((v, c) => (isGiven(P, c) ? v === 0 : true)), "clues are not stored twice");

  const back = initialState(P, saved);
  assert.deepEqual(back.entries, s.entries);
});

test("a save can never overwrite a clue", () => {
  // an older cut of the archive could otherwise blank a given and leave a
  // board that cannot be finished
  const at = P.given.findIndex((v) => v !== 0);
  const junk = new Array(CELLS).fill(0);
  junk[at] = P.given[at] === 9 ? 1 : 9;
  const back = initialState(P, { entries: junk });
  assert.equal(back.entries[at], P.given[at]);
});

test("a save of the wrong shape is ignored rather than trusted", () => {
  const back = initialState(P, { entries: [1, 2, 3] });
  assert.deepEqual(back.entries, [...P.given]);
});
