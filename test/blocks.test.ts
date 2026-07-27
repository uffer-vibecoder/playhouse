import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encode,
  initialState,
  isPerfect,
  isSolved,
  reach,
  slide,
  solve,
  undo,
  type Block,
  type Gate,
  type Puzzle,
} from "../src/games/blocks/engine.ts";

const puzzle = (
  w: number,
  h: number,
  blocks: Omit<Block, "id">[],
  gates: Gate[],
  par = 0
): Puzzle => ({
  id: "TEST",
  w,
  h,
  blocks: blocks.map((b, i) => ({ ...b, id: i })),
  gates,
  par,
});

/* ── leaving ──────────────────────────────────────────────────────────────── */

test("a block leaves through a gate of its own colour", () => {
  const p = puzzle(3, 3, [{ x: 1, y: 1, w: 1, h: 1, hue: "rose" }], [
    { edge: "top", at: 1, len: 1, hue: "rose" },
  ]);
  const s = slide(p, initialState(p), 0, "up");
  assert.equal(s.blocks.length, 0);
  assert.ok(isSolved(s));
  assert.equal(s.moves, 1);
});

test("a gate of the wrong colour is a wall", () => {
  const p = puzzle(3, 3, [{ x: 1, y: 1, w: 1, h: 1, hue: "rose" }], [
    { edge: "top", at: 1, len: 1, hue: "sage" },
  ]);
  const s = slide(p, initialState(p), 0, "up");
  // it still travels to the wall — it just cannot go through it
  assert.equal(s.blocks.length, 1);
  assert.deepEqual([s.blocks[0].x, s.blocks[0].y], [1, 0]);
  assert.equal(solve(p), null);
});

test("a block wider than its gate cannot squeeze through", () => {
  const p = puzzle(3, 3, [{ x: 0, y: 1, w: 2, h: 1, hue: "rose" }], [
    { edge: "top", at: 0, len: 1, hue: "rose" },
  ]);
  assert.equal(solve(p), null);

  // widen the same gate by one and it becomes a one-move puzzle
  const wider = puzzle(3, 3, [{ x: 0, y: 1, w: 2, h: 1, hue: "rose" }], [
    { edge: "top", at: 0, len: 2, hue: "rose" },
  ]);
  assert.equal(solve(wider), 1);
});

test("a block stopped short of the wall does not leave", () => {
  // the sage block sits in the doorway, so rose reaches y=1 and stays
  const p = puzzle(
    3,
    3,
    [
      { x: 1, y: 2, w: 1, h: 1, hue: "rose" },
      { x: 1, y: 0, w: 1, h: 1, hue: "sage" },
    ],
    [{ edge: "top", at: 1, len: 1, hue: "rose" }]
  );
  const s = slide(p, initialState(p), 0, "up");
  assert.equal(s.blocks.length, 2);
  assert.deepEqual([s.blocks[0].x, s.blocks[0].y], [1, 1]);
});

test("a partial slide stops where asked and never exits", () => {
  const p = puzzle(3, 4, [{ x: 1, y: 3, w: 1, h: 1, hue: "rose" }], [
    { edge: "top", at: 1, len: 1, hue: "rose" },
  ]);
  const s = slide(p, initialState(p), 0, "up", 2);
  assert.equal(s.blocks.length, 1);
  assert.deepEqual([s.blocks[0].x, s.blocks[0].y], [1, 1]);
});

test("a move that cannot happen returns the very same state", () => {
  const p = puzzle(1, 1, [{ x: 0, y: 0, w: 1, h: 1, hue: "rose" }], []);
  const s = initialState(p);
  assert.equal(slide(p, s, 0, "up"), s, "identity, so callers can tell nothing happened");
});

/* ── order of play ────────────────────────────────────────────────────────── */

test("one block has to get out of the other's way first", () => {
  const p = puzzle(
    3,
    3,
    [
      { x: 1, y: 1, w: 1, h: 1, hue: "rose" },
      { x: 1, y: 0, w: 1, h: 1, hue: "sage" },
    ],
    [
      { edge: "top", at: 1, len: 1, hue: "rose" },
      { edge: "left", at: 0, len: 1, hue: "sage" },
    ]
  );
  assert.equal(solve(p), 2, "sage leaves, then rose can");

  let s = initialState(p);
  s = slide(p, s, 1, "left");
  s = slide(p, s, 0, "up");
  assert.ok(isSolved(s));
  assert.ok(isPerfect({ ...p, par: 2 }, s));
});

test("taking the long way round still finishes, but is not perfect", () => {
  const p = puzzle(
    3,
    3,
    [
      { x: 1, y: 1, w: 1, h: 1, hue: "rose" },
      { x: 1, y: 0, w: 1, h: 1, hue: "sage" },
    ],
    [
      { edge: "top", at: 1, len: 1, hue: "rose" },
      { edge: "left", at: 0, len: 1, hue: "sage" },
    ],
    2
  );
  let s = initialState(p);
  // note the explicit distances: a slide with no distance travels as far as it
  // can, so "put it back" has to say by how much
  s = slide(p, s, 0, "left", 1); // a wasted move
  s = slide(p, s, 1, "left");
  s = slide(p, s, 0, "right", 1);
  s = slide(p, s, 0, "up");
  assert.ok(isSolved(s));
  assert.equal(s.moves, 4);
  assert.ok(!isPerfect(p, s), "finished, but not in par");
});

/* ── undo ─────────────────────────────────────────────────────────────────── */

test("undo puts a departed block back", () => {
  const p = puzzle(3, 3, [{ x: 1, y: 1, w: 1, h: 1, hue: "rose" }], [
    { edge: "top", at: 1, len: 1, hue: "rose" },
  ]);
  const start = initialState(p);
  const gone = slide(p, start, 0, "up");
  assert.equal(gone.blocks.length, 0);

  const back = undo(gone);
  assert.equal(back.blocks.length, 1);
  assert.deepEqual([back.blocks[0].x, back.blocks[0].y], [1, 1]);
  assert.equal(back.moves, 0);
});

test("undo at the start is a no-op", () => {
  const p = puzzle(3, 3, [{ x: 1, y: 1, w: 1, h: 1, hue: "rose" }], []);
  const s = initialState(p);
  assert.equal(undo(s), s);
});

/* ── the search ───────────────────────────────────────────────────────────── */

test("two blocks alike are one position, not two", () => {
  const a: Block[] = [
    { id: 0, x: 0, y: 0, w: 1, h: 1, hue: "rose" },
    { id: 1, x: 2, y: 2, w: 1, h: 1, hue: "rose" },
  ];
  const swapped: Block[] = [
    { id: 0, x: 2, y: 2, w: 1, h: 1, hue: "rose" },
    { id: 1, x: 0, y: 0, w: 1, h: 1, hue: "rose" },
  ];
  assert.equal(encode(a), encode(swapped), "interchangeable blocks fold together");
});

test("blocks of different colours in the same places are different positions", () => {
  const a: Block[] = [
    { id: 0, x: 0, y: 0, w: 1, h: 1, hue: "rose" },
    { id: 1, x: 2, y: 2, w: 1, h: 1, hue: "sage" },
  ];
  const b: Block[] = [
    { id: 0, x: 0, y: 0, w: 1, h: 1, hue: "sage" },
    { id: 1, x: 2, y: 2, w: 1, h: 1, hue: "rose" },
  ];
  assert.notEqual(encode(a), encode(b));
});

test("an unreachable board is reported as unsolvable, not guessed at", () => {
  // no gates at all
  const p = puzzle(3, 3, [{ x: 1, y: 1, w: 1, h: 1, hue: "rose" }], []);
  assert.equal(solve(p), null);
});

test("reach reports how far, and whether that is out", () => {
  const p = puzzle(4, 4, [{ x: 0, y: 3, w: 1, h: 1, hue: "rose" }], [
    { edge: "top", at: 0, len: 1, hue: "rose" },
  ]);
  const r = reach(p, p.blocks, 0, "up");
  assert.equal(r.max, 3);
  assert.ok(r.canExit);

  const sideways = reach(p, p.blocks, 0, "right");
  assert.equal(sideways.max, 3);
  assert.ok(!sideways.canExit, "no gate on that wall");
});
