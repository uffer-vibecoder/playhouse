import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CELLS,
  SHAPES,
  SIZE,
  TRAY,
  at,
  fits,
  fitsAnywhere,
  fullLines,
  initialState,
  isOver,
  pieceAt,
  place,
  toSave,
  wouldClear,
} from "../src/games/blockout/engine.ts";

const SEED = 20260727;
const shapeNamed = (n: string) => SHAPES.findIndex((s) => s.shape.name === n);

/** A state with a chosen tray, for testing a placement rather than a draw. */
const withTray = (names: string[], grid?: number[]) => {
  const s = initialState(SEED);
  return {
    ...s,
    grid: grid ?? s.grid,
    tray: names.map((n) => ({ shapeIndex: shapeNamed(n), used: false })),
  };
};

/* ── the supply ───────────────────────────────────────────────────────────── */

test("the same seed deals the same pieces, forever", () => {
  const a = Array.from({ length: 30 }, (_, i) => pieceAt(SEED, i));
  const b = Array.from({ length: 30 }, (_, i) => pieceAt(SEED, i));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, Array.from({ length: 30 }, (_, i) => pieceAt(SEED + 1, i)));
});

test("a draw is always a real piece", () => {
  for (let i = 0; i < 500; i++) {
    const n = pieceAt(SEED, i);
    assert.ok(n >= 0 && n < SHAPES.length, `draw ${i} gave ${n}`);
  }
});

test("the big square is rare and the small pieces are not", () => {
  const counts = new Map<string, number>();
  for (let i = 0; i < 4000; i++) {
    const name = SHAPES[pieceAt(SEED, i)].shape.name;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const big = counts.get("big square") ?? 0;
  const three = counts.get("three") ?? 0;
  assert.ok(big > 0, "it does turn up");
  assert.ok(three > big * 3, "but far less than a three does");
});

test("a board opens with three pieces and an empty grid", () => {
  const s = initialState(SEED);
  assert.equal(s.grid.length, CELLS);
  assert.ok(s.grid.every((c) => c === 0));
  assert.equal(s.tray.length, TRAY);
  assert.equal(s.score, 0);
  assert.ok(!isOver(s));
});

/* ── placing ──────────────────────────────────────────────────────────────── */

test("a piece has to be on the board and on empty squares", () => {
  const s = withTray(["square"]);
  const square = SHAPES[shapeNamed("square")].shape;
  assert.ok(fits(s.grid, square, 0, 0));
  assert.ok(!fits(s.grid, square, SIZE - 1, 0), "half of it would hang off the edge");

  const filled = s.grid.slice();
  filled[at(1, 1)] = 1;
  assert.ok(!fits(filled, square, 0, 0), "one occupied square is enough to refuse it");
});

test("placing scores a point a square and uses the piece up", () => {
  let s = withTray(["three", "dot", "dot"]);
  s = place(s, 0, 0, 0);
  assert.equal(s.score, 3, "three squares, three points");
  assert.ok(s.tray[0].used);
  assert.equal(s.placed, 1);
  assert.equal(s.grid.filter((c) => c !== 0).length, 3);
});

test("an illegal placement changes nothing at all", () => {
  const s = withTray(["big square"]);
  const same = place(s, 0, 7, 7);
  assert.equal(same, s, "identity, so no move is counted and no piece consumed");
});

test("a piece already used cannot be used again", () => {
  let s = withTray(["dot", "dot", "dot"]);
  s = place(s, 0, 0, 0);
  const after = s;
  s = place(s, 0, 1, 1);
  assert.equal(s, after);
});

/* ── clearing ─────────────────────────────────────────────────────────────── */

test("a full row goes, and scores more than the squares did", () => {
  // fill row 0 except the last square, then drop a dot into the gap
  const grid = Array(CELLS).fill(0);
  for (let x = 0; x < SIZE - 1; x++) grid[at(x, 0)] = 1;
  let s = withTray(["dot"], grid);
  const before = s.score;
  s = place(s, 0, SIZE - 1, 0);

  for (let x = 0; x < SIZE; x++) assert.equal(s.grid[at(x, 0)], 0, "the row is gone");
  assert.equal(s.score, before + 1 + 10, "a square, plus ten for the line");
  assert.equal(s.streak, 1);
});

test("a row and a column that complete together are counted together", () => {
  // everything full except the last square of row 0, which is also the last
  // square of column 7 — one dot finishes both
  const grid = Array(CELLS).fill(0);
  for (let x = 0; x < SIZE - 1; x++) grid[at(x, 0)] = 1;
  for (let y = 1; y < SIZE; y++) grid[at(SIZE - 1, y)] = 1;
  let s = withTray(["dot"], grid);
  s = place(s, 0, SIZE - 1, 0);

  const { rows, cols } = fullLines(s.grid);
  assert.equal(rows.length + cols.length, 0, "both went");
  // 1 square + two lines at ten + ten for the second landing at once
  assert.equal(s.score, 1 + 20 + 10);
});

test("clearing two at once beats clearing one twice", () => {
  const twoAtOnce = (() => {
    const grid = Array(CELLS).fill(0);
    for (let x = 0; x < SIZE - 1; x++) grid[at(x, 0)] = 1;
    for (let y = 1; y < SIZE; y++) grid[at(SIZE - 1, y)] = 1;
    return place(withTray(["dot"], grid), 0, SIZE - 1, 0).score;
  })();

  const oneTwice = (() => {
    let total = 0;
    for (const row of [0, 1]) {
      const grid = Array(CELLS).fill(0);
      for (let x = 0; x < SIZE - 1; x++) grid[at(x, row)] = 1;
      total += place(withTray(["dot"], grid), 0, SIZE - 1, row).score;
    }
    return total;
  })();

  assert.ok(twoAtOnce > oneTwice, `${twoAtOnce} should beat ${oneTwice}`);
});

test("the streak resets the moment a placement clears nothing", () => {
  const grid = Array(CELLS).fill(0);
  for (let x = 0; x < SIZE - 1; x++) grid[at(x, 0)] = 1;
  let s = withTray(["dot", "dot", "dot"], grid);
  s = place(s, 0, SIZE - 1, 0);
  assert.equal(s.streak, 1);
  s = place(s, 1, 0, 4);
  assert.equal(s.streak, 0, "a quiet turn ends it");
});

test("wouldClear tells you before you commit, and there is no undo here", () => {
  const grid = Array(CELLS).fill(0);
  for (let x = 0; x < SIZE - 1; x++) grid[at(x, 0)] = 1;
  const dot = SHAPES[shapeNamed("dot")].shape;
  assert.equal(wouldClear(grid, dot, SIZE - 1, 0).length, SIZE, "the whole row lights up");
  assert.equal(wouldClear(grid, dot, 3, 4).length, 0);
  assert.equal(wouldClear(grid, dot, 0, 0).length, 0, "it does not even fit there");
});

/* ── the end ──────────────────────────────────────────────────────────────── */

/**
 * A board with two empties in every row and every column — so no line is
 * already full and nothing can complete one — arranged as adjacent pairs that
 * a 2×2 cannot sit in.
 */
const stuckBoard = () => {
  const grid = Array(CELLS).fill(1);
  for (let i = 0; i < SIZE; i++) {
    grid[at(i, i)] = 0;
    grid[at((i + 1) % SIZE, i)] = 0;
  }
  return grid;
};

test("a board with nowhere for any of the three is over", () => {
  const grid = stuckBoard();
  const square = SHAPES[shapeNamed("square")].shape;
  assert.ok(!fitsAnywhere(grid, square), "no 2×2 hole anywhere");
  assert.equal(fullLines(grid).rows.length + fullLines(grid).cols.length, 0, "and nothing is full");

  const s = initialState(SEED, {
    grid,
    tray: [shapeNamed("square"), shapeNamed("square"), shapeNamed("big square")],
    score: 500,
    streak: 0,
    placed: 40,
  });
  assert.ok(isOver(s), "restoring a finished run must not offer it back as playable");
  assert.equal(s.score, 500, "and the score it ended on is still there");
});

test("a restored run that still has a move is not over", () => {
  const grid = stuckBoard();
  const s = initialState(SEED, {
    grid,
    tray: [shapeNamed("dot")],
    score: 10,
    streak: 0,
    placed: 3,
  });
  assert.ok(!isOver(s), "a single square still goes in a single gap");
});

test("the run ends when the last placement leaves nothing that fits", () => {
  const grid = stuckBoard();
  // one extra gap so a dot has somewhere to go, and after it the squares are
  // still stuck — placing it must end the run rather than wait to be noticed
  let live = initialState(SEED, {
    grid,
    tray: [shapeNamed("dot"), shapeNamed("square"), shapeNamed("square")],
    score: 0,
    streak: 0,
    placed: 0,
  });
  assert.ok(!isOver(live));
  live = place(live, 0, 0, 0);
  assert.ok(isOver(live), "the dot went in and nothing else will");
});

test("a fresh three arrives only when all three have gone", () => {
  let s = withTray(["dot", "dot", "dot"]);
  s = place(s, 0, 0, 0);
  assert.equal(s.tray.filter((p) => !p.used).length, 2, "no refill yet");
  s = place(s, 1, 2, 0);
  assert.equal(s.tray.filter((p) => !p.used).length, 1);
  s = place(s, 2, 4, 0);
  assert.equal(s.tray.filter((p) => !p.used).length, 3, "now three fresh ones");
});

/* ── saving ───────────────────────────────────────────────────────────────── */

test("a save keeps the grid, the score and only the pieces still to play", () => {
  let s = withTray(["dot", "three", "square"]);
  s = place(s, 0, 0, 0);
  const saved = toSave(s);
  assert.equal(saved.tray.length, 2, "the used one is not carried");
  assert.equal(saved.score, s.score);
  assert.equal(saved.grid.length, CELLS);

  const back = initialState(SEED, saved);
  assert.deepEqual(back.grid, s.grid);
  assert.equal(back.score, s.score);
  assert.equal(back.tray.length, 2);
});

test("two runs on one page do not share a supply", () => {
  // the seed lives on the state; an earlier draft kept it in a module variable,
  // which two boards would have fought over
  const a = initialState(1000);
  const b = initialState(2000);
  assert.equal(a.seed, 1000);
  assert.equal(b.seed, 2000);
  const afterA = place({ ...a, tray: [{ shapeIndex: shapeNamed("dot"), used: false }] }, 0, 0, 0);
  assert.equal(afterA.seed, 1000, "and it survives a placement");
});
