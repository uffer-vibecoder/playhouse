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
  gate: Gate,
  par = 0
): Puzzle => ({
  id: "TEST",
  w,
  h,
  blocks: blocks.map((b, i) => ({ ...b, id: i })),
  gate,
  par,
});

const OUT_TOP: Gate = { edge: "top", at: 1, len: 1 };

/* ── getting out ──────────────────────────────────────────────────────────── */

test("the marked block leaves by the way out", () => {
  const p = puzzle(3, 3, [{ x: 1, y: 1, w: 1, h: 1, hero: true }], OUT_TOP);
  const s = slide(p, initialState(p), 0, "up");
  assert.ok(isSolved(s));
  assert.equal(s.moves, 1);
});

test("an unmarked block reaches the doorway and stays there", () => {
  // the way out is not a hole anyone may use; it belongs to one block
  const p = puzzle(3, 3, [{ x: 1, y: 1, w: 1, h: 1 }], OUT_TOP);
  const s = slide(p, initialState(p), 0, "up");
  assert.equal(s.blocks.length, 1, "still on the board");
  assert.deepEqual([s.blocks[0].x, s.blocks[0].y], [1, 0], "pressed against the wall");
  assert.ok(!isSolved(s));
  assert.equal(solve(p), null, "and there is no way to win a board with nobody to free");
});

test("a block wider than the way out cannot squeeze through", () => {
  const narrow = puzzle(3, 3, [{ x: 0, y: 1, w: 2, h: 1, hero: true }], { edge: "top", at: 0, len: 1 });
  assert.equal(solve(narrow), null);

  const wider = puzzle(3, 3, [{ x: 0, y: 1, w: 2, h: 1, hero: true }], { edge: "top", at: 0, len: 2 });
  assert.equal(solve(wider), 1, "widen it by one and it is a one-move puzzle");
});

test("a block standing in its own doorway can simply step out", () => {
  // it has nowhere to travel, so every earlier version skipped it entirely —
  // the one block already at the exit was the one that could not use it
  const p = puzzle(3, 3, [{ x: 1, y: 0, w: 1, h: 1, hero: true }], OUT_TOP);
  assert.equal(solve(p), 1);
  const s = slide(p, initialState(p), 0, "up");
  assert.ok(isSolved(s));
  assert.equal(s.moves, 1);
});

test("a block stopped short of the wall does not leave", () => {
  const p = puzzle(
    3,
    3,
    [
      { x: 1, y: 2, w: 1, h: 1, hero: true },
      { x: 1, y: 0, w: 1, h: 1 }, // sitting in the doorway
    ],
    OUT_TOP
  );
  const s = slide(p, initialState(p), 0, "up");
  assert.equal(s.blocks.length, 2);
  assert.deepEqual([s.blocks[0].x, s.blocks[0].y], [1, 1]);
});

test("a partial slide stops where asked and never exits", () => {
  const p = puzzle(3, 4, [{ x: 1, y: 3, w: 1, h: 1, hero: true }], OUT_TOP);
  const s = slide(p, initialState(p), 0, "up", 2);
  assert.ok(!isSolved(s));
  assert.deepEqual([s.blocks[0].x, s.blocks[0].y], [1, 1]);
});

test("a move that cannot happen returns the very same state", () => {
  const p = puzzle(1, 1, [{ x: 0, y: 0, w: 1, h: 1 }], { edge: "left", at: 0, len: 1 });
  const s = initialState(p);
  assert.equal(slide(p, s, 0, "up"), s, "identity, so callers can tell nothing happened");
});

/* ── order of play ────────────────────────────────────────────────────────── */

test("the obstacle has to move before the hero can get past", () => {
  const p = puzzle(
    3,
    3,
    [
      { x: 1, y: 1, w: 1, h: 1, hero: true },
      { x: 1, y: 0, w: 1, h: 1 },
    ],
    OUT_TOP
  );
  assert.equal(solve(p), 2, "shove it aside, then out");

  let s = initialState(p);
  s = slide(p, s, 1, "left");
  s = slide(p, s, 0, "up");
  assert.ok(isSolved(s));
  assert.ok(isPerfect({ ...p, par: 2 }, s));
});

test("taking the long way round still gets out, but is not perfect", () => {
  const p = puzzle(
    3,
    3,
    [
      { x: 1, y: 1, w: 1, h: 1, hero: true },
      { x: 1, y: 0, w: 1, h: 1 },
    ],
    OUT_TOP,
    2
  );
  let s = initialState(p);
  // explicit distances: a slide with no distance travels as far as it can, so
  // "put it back" has to say by how much
  s = slide(p, s, 0, "left", 1);
  s = slide(p, s, 1, "left");
  s = slide(p, s, 0, "right", 1);
  s = slide(p, s, 0, "up");
  assert.ok(isSolved(s));
  assert.equal(s.moves, 4);
  assert.ok(!isPerfect(p, s), "out, but not by the shortest way");
});

test("the obstacles stay put when the hero leaves", () => {
  const p = puzzle(
    3,
    3,
    [
      { x: 1, y: 1, w: 1, h: 1, hero: true },
      { x: 0, y: 2, w: 1, h: 1 },
    ],
    OUT_TOP
  );
  const s = slide(p, initialState(p), 0, "up");
  assert.ok(isSolved(s));
  assert.equal(s.blocks.length, 1, "the obstacle is still there — it never had anywhere to go");
});

/* ── undo ─────────────────────────────────────────────────────────────────── */

test("undo puts a departed block back", () => {
  const p = puzzle(3, 3, [{ x: 1, y: 1, w: 1, h: 1, hero: true }], OUT_TOP);
  const gone = slide(p, initialState(p), 0, "up");
  assert.ok(isSolved(gone));

  const back = undo(gone);
  assert.ok(!isSolved(back));
  assert.deepEqual([back.blocks[0].x, back.blocks[0].y], [1, 1]);
  assert.equal(back.moves, 0);
});

test("undo at the start is a no-op", () => {
  const p = puzzle(3, 3, [{ x: 1, y: 1, w: 1, h: 1, hero: true }], OUT_TOP);
  const s = initialState(p);
  assert.equal(undo(s), s);
});

/* ── the search ───────────────────────────────────────────────────────────── */

test("two obstacles alike are one position, not two", () => {
  const a: Block[] = [
    { id: 0, x: 1, y: 1, w: 1, h: 1, hero: true },
    { id: 1, x: 0, y: 0, w: 1, h: 1 },
    { id: 2, x: 2, y: 2, w: 1, h: 1 },
  ];
  const swapped: Block[] = [
    { id: 0, x: 1, y: 1, w: 1, h: 1, hero: true },
    { id: 1, x: 2, y: 2, w: 1, h: 1 },
    { id: 2, x: 0, y: 0, w: 1, h: 1 },
  ];
  assert.equal(encode(a), encode(swapped), "interchangeable obstacles fold together");
});

test("the hero is not interchangeable with an obstacle", () => {
  const a: Block[] = [
    { id: 0, x: 0, y: 0, w: 1, h: 1, hero: true },
    { id: 1, x: 2, y: 2, w: 1, h: 1 },
  ];
  const b: Block[] = [
    { id: 0, x: 2, y: 2, w: 1, h: 1, hero: true },
    { id: 1, x: 0, y: 0, w: 1, h: 1 },
  ];
  assert.notEqual(encode(a), encode(b), "which one is trying to leave is the whole puzzle");
});

test("a key is never NaN, whatever the block", () => {
  // every state once hashed to "NaN,NaN" because the key still multiplied by a
  // colour that no longer existed — so the search decided its first move had
  // already been seen, explored one level, and called every board unsolvable
  const key = encode([
    { id: 0, x: 1, y: 2, w: 2, h: 1, hero: true },
    { id: 1, x: 0, y: 0, w: 1, h: 3 },
  ]);
  assert.ok(!key.includes("NaN"), key);
  assert.ok(key.includes("/"), "hero packed apart from the rest");
});

test("a hero boxed in for good is reported unsolvable, not guessed at", () => {
  // a full-height block in the next column can never clear the hero's row
  const p = puzzle(
    4,
    3,
    [
      { x: 0, y: 1, w: 1, h: 1, hero: true },
      { x: 2, y: 0, w: 1, h: 3 },
    ],
    { edge: "right", at: 1, len: 1 }
  );
  assert.equal(solve(p, 50_000), null);
});

test("reach reports how far, and whether that is out", () => {
  const p = puzzle(4, 4, [{ x: 0, y: 3, w: 1, h: 1, hero: true }], { edge: "top", at: 0, len: 1 });
  const up = reach(p, p.blocks, 0, "up");
  assert.equal(up.max, 3);
  assert.ok(up.canExit);

  const sideways = reach(p, p.blocks, 0, "right");
  assert.equal(sideways.max, 3);
  assert.ok(!sideways.canExit, "no way out on that wall");
});

/* ── what shipped ─────────────────────────────────────────────────────────── */

test("every board has exactly one block trying to get out", async () => {
  const { readFileSync } = await import("node:fs");
  const archive: Puzzle[] = JSON.parse(readFileSync("src/data/blocks.json", "utf8"));
  assert.ok(archive.length > 0);
  for (const p of archive) {
    const heroes = p.blocks.filter((b) => b.hero);
    assert.equal(heroes.length, 1, `${p.id} has ${heroes.length}`);
    assert.ok(p.blocks.length > 1, `${p.id} has nothing in the way`);
    assert.ok(p.par >= 1, `${p.id} claims a par of ${p.par}`);
  }
});

test("no board starts with the hero already in the doorway", async () => {
  const { readFileSync } = await import("node:fs");
  const archive: Puzzle[] = JSON.parse(readFileSync("src/data/blocks.json", "utf8"));
  for (const p of archive) {
    const hero = p.blocks.find((b) => b.hero)!;
    const g = p.gate;
    const atDoor =
      (g.edge === "top" && hero.y === 0) ||
      (g.edge === "bottom" && hero.y + hero.h === p.h) ||
      (g.edge === "left" && hero.x === 0) ||
      (g.edge === "right" && hero.x + hero.w === p.w);
    assert.ok(!atDoor, `${p.id} starts finished`);
  }
});

/* ── a block that is no longer there ──────────────────────────────────────── */

test("pushing a block that has already left does nothing, rather than throwing", () => {
  /*
   * Reachable, and it was a white screen on a board you had just won: pick up
   * the hero, drag it out through the gate, then press an arrow key. The board
   * still remembers which block was picked, that block is gone, and `reach`
   * asserted it existed — so the no-op became a TypeError inside a React state
   * updater. Found by fuzzing.
   */
  const p = puzzle(3, 3, [{ x: 1, y: 1, w: 1, h: 1, hero: true }], OUT_TOP);
  const gone = slide(p, initialState(p), 0, "up");
  assert.ok(isSolved(gone));
  assert.equal(gone.blocks.length, 0);

  for (const dir of ["up", "down", "left", "right"] as const) {
    assert.equal(slide(p, gone, 0, dir), gone, `${dir}: same state back, no exception`);
    assert.deepEqual(reach(p, gone.blocks, 0, dir), { max: 0, canExit: false });
  }
});

test("an id that never existed is treated the same way", () => {
  const p = puzzle(3, 3, [{ x: 1, y: 1, w: 1, h: 1, hero: true }], OUT_TOP);
  const s = initialState(p);
  assert.equal(slide(p, s, 99, "up"), s);
  assert.equal(reach(p, s.blocks, 99, "up").max, 0);
});
