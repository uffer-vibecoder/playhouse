import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CELLS,
  SIZE,
  board,
  homeCount,
  initialState,
  isSolvable,
  isSolved,
  isSolvedPuzzle,
  isWellFormed,
  neighbours,
  slide,
  slideByDirection,
  solvedTiles,
  type Puzzle,
  type State,
  type Tiles,
} from "../src/games/slide/engine.ts";

const puz = (seed: number): Puzzle => ({ id: "SL-TEST", seed });
const st = (tiles: Tiles): State => ({ tiles, last: null });

/* ── the parity rule itself ──────────────────────────────────────────────── */

test("the solved board is solvable", () => {
  assert.ok(isSolvable(solvedTiles()));
});

test("swapping two tiles makes a board unsolvable", () => {
  // The classic impossible board: everything in order but 14 and 15 exchanged.
  const t = solvedTiles();
  [t[13], t[14]] = [t[14], t[13]];
  assert.ok(!isSolvable(t), "14/15 swapped must be unreachable");
});

test("a single legal move keeps a board solvable", () => {
  const moved = slide(st(solvedTiles()), CELLS - 2);
  assert.ok(isSolvable(moved.tiles));
});

/* ── generation ──────────────────────────────────────────────────────────── */

test("every generated board is solvable, across many seeds and positions", () => {
  // The point of building forwards rather than shuffling: this must never fail.
  for (let seed = 1; seed <= 300; seed++) {
    for (const index of [0, 5, 40, 119]) {
      const t = board(puz(seed), index);
      assert.ok(isSolvable(t), `seed ${seed} at index ${index} produced an impossible board`);
    }
  }
});

test("every generated board is a genuine permutation", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const t = board(puz(seed), 20);
    assert.ok(isWellFormed(t));
    assert.equal(new Set(t).size, CELLS);
  }
});

test("a seed always produces the same board", () => {
  assert.deepEqual(board(puz(777), 9), board(puz(777), 9));
  assert.notDeepEqual(board(puz(777), 9), board(puz(778), 9));
});

test("no puzzle is issued already solved", () => {
  for (let seed = 1; seed <= 300; seed++) {
    assert.ok(!isSolved(board(puz(seed), 0)), `seed ${seed} was born finished`);
  }
});

test("later puzzles start further from solved", () => {
  const early = homeCount(st(board(puz(5), 0)));
  let laterTotal = 0;
  for (let seed = 1; seed <= 40; seed++) laterTotal += homeCount(st(board(puz(seed), 100)));
  // a soft check: deep scrambles should not leave most tiles sitting at home
  assert.ok(laterTotal / 40 < early + 6);
});

/* ── moving ──────────────────────────────────────────────────────────────── */

test("a tile next to the gap slides into it", () => {
  const s = slide(st(solvedTiles()), CELLS - 2); // the 15, left of the gap
  assert.equal(s.tiles[CELLS - 1], 15);
  assert.equal(s.tiles[CELLS - 2], 0);
  assert.equal(s.last, 15);
});

test("a tile out of line with the gap does not move", () => {
  const before = solvedTiles();
  const after = slide(st(before), 0); // top-left, sharing neither row nor column
  assert.deepEqual(after.tiles, before);
});

test("tapping the gap itself does nothing", () => {
  const before = solvedTiles();
  assert.deepEqual(slide(st(before), before.indexOf(0)).tiles, before);
});

test("a whole row slides at once", () => {
  // Gap is bottom-right; tapping the start of that row should pull three tiles.
  const s = slide(st(solvedTiles()), CELLS - SIZE);
  assert.equal(s.tiles[CELLS - SIZE], 0, "the gap ends where it was tapped");
  assert.deepEqual(s.tiles.slice(CELLS - SIZE), [0, 13, 14, 15]);
  assert.ok(isSolvable(s.tiles));
});

test("arrow keys move the gap, not the tile", () => {
  const s = slideByDirection(st(solvedTiles()), 0, -1); // gap left
  assert.equal(s.tiles[CELLS - 1], 15);
  assert.deepEqual(slideByDirection(st(solvedTiles()), 0, 1).tiles, solvedTiles(), "off-board is refused");
});

test("sliding never breaks solvability, over a long random walk", () => {
  let s = st(board(puz(31), 30));
  for (let i = 0; i < 400; i++) {
    const gap = s.tiles.indexOf(0);
    const options = neighbours(gap);
    s = slide(s, options[i % options.length]);
    assert.ok(isSolvable(s.tiles), `walk broke solvability at step ${i}`);
  }
});

/* ── solving and restoring ───────────────────────────────────────────────── */

test("ordering the tiles solves the puzzle", () => {
  assert.ok(isSolvedPuzzle(st(solvedTiles())));
  assert.ok(!isSolvedPuzzle(st(board(puz(3), 10))));
});

test("homeCount counts tiles already in place, ignoring the gap", () => {
  assert.equal(homeCount(st(solvedTiles())), CELLS - 1);
});

test("a good save is restored", () => {
  const tiles = board(puz(12), 4);
  const s = initialState(puz(12), 4, { tiles });
  assert.deepEqual(s.tiles, tiles);
});

test("a tampered or impossible save falls back to the issued board", () => {
  const impossible = solvedTiles();
  [impossible[13], impossible[14]] = [impossible[14], impossible[13]];
  const fresh = board(puz(12), 4);

  for (const bad of [
    { tiles: impossible },
    { tiles: [1, 2, 3] as Tiles },
    { tiles: Array(CELLS).fill(1) as Tiles },
    { tiles: "nonsense" as unknown as Tiles },
  ]) {
    const s = initialState(puz(12), 4, bad);
    assert.deepEqual(s.tiles, fresh, "a bad save must not strand the player");
  }
});

test("isWellFormed rejects the obvious ways a save can be wrong", () => {
  assert.ok(isWellFormed(solvedTiles()));
  assert.ok(!isWellFormed([]));
  assert.ok(!isWellFormed(Array(CELLS).fill(0)));
  assert.ok(!isWellFormed([...solvedTiles(), 3]));
  assert.ok(!isWellFormed(null));
});

test("the archive's seeds are all distinct", async () => {
  const { default: archive } = await import("../src/data/slide.json", {
    with: { type: "json" },
  });
  const seeds = new Set((archive as Puzzle[]).map((p) => p.seed));
  assert.equal(seeds.size, (archive as Puzzle[]).length);
  assert.ok(seeds.size > 0);
});
