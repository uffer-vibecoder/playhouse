import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEPTH,
  SPARE,
  canPour,
  done,
  encode,
  initialState,
  isPure,
  isSolved,
  nextPour,
  options,
  pour,
  pourSize,
  runLength,
  solve,
  stuck,
  toSave,
  topOf,
  undo,
  type Puzzle,
} from "../src/games/water/engine.ts";

const archive: Puzzle[] = JSON.parse(readFileSync("src/data/water.json", "utf8"));
const P = archive[0];

/* ── the archive ──────────────────────────────────────────────────────────── */

test("every board holds exactly four of every colour, and two spare tubes", () => {
  for (const p of archive) {
    const n = new Map<number, number>();
    for (const t of p.tubes) {
      assert.ok(t.length <= DEPTH, `${p.id}: a tube starts overfull`);
      for (const v of t) n.set(v, (n.get(v) ?? 0) + 1);
    }
    assert.equal(n.size, p.colours, `${p.id}: claims ${p.colours} colours, holds ${n.size}`);
    for (const [colour, count] of n) {
      assert.equal(count, DEPTH, `${p.id}: colour ${colour} appears ${count} times`);
    }
    assert.equal(
      p.tubes.filter((t) => t.length === 0).length,
      SPARE,
      `${p.id}: wrong number of spare tubes`
    );
    assert.equal(p.tubes.length, p.colours + SPARE, p.id);
  }
});

test("no board is dealt with a colour already finished", () => {
  // a free colour is a disappointment rather than a puzzle
  for (const p of archive) {
    for (const t of p.tubes) {
      assert.ok(!(t.length === DEPTH && isPure(t)), `${p.id} starts with a colour done`);
    }
  }
});

test("every board can be solved, and par is the shortest way", () => {
  // par is measured breadth-first. A par that were merely *some* solution would
  // be worse than none: it would call a good game careless.
  for (const p of archive) {
    const path = solve(p.tubes, 800_000);
    assert.notEqual(path, "capped", `${p.id}: could not be proved`);
    assert.ok(Array.isArray(path), `${p.id}: cannot be solved at all`);
    assert.equal((path as [number, number][]).length, p.par, `${p.id}: par disagrees`);
  }
});

test("replaying par actually finishes the board", () => {
  // the solver and the rules the player uses are different code paths; this is
  // the one test that makes them agree
  for (const p of archive.slice(0, 20)) {
    const path = solve(p.tubes, 800_000) as [number, number][];
    let s = initialState(p);
    for (const [from, to] of path) {
      const next = pour(s, from, to);
      assert.notEqual(next, s, `${p.id}: the solver played a pour the rules refuse`);
      s = next;
    }
    assert.ok(isSolved(s), `${p.id}: the solver's route does not finish it`);
    assert.equal(s.moves, p.par);
  }
});

test("the colours a board uses are numbered from zero with no gaps", () => {
  // the board renders `ws-hue-${colour}`, and there are ten of those
  for (const p of archive) {
    const seen = new Set(p.tubes.flat());
    for (let c = 0; c < p.colours; c++) assert.ok(seen.has(c), `${p.id} skips colour ${c}`);
    assert.ok(Math.max(...seen) < 10, `${p.id} uses a colour with no hue defined`);
  }
});

/* ── the rules ────────────────────────────────────────────────────────────── */

const board = (tubes: number[][]): Puzzle => ({
  id: "TEST",
  colours: 2,
  tubes,
  par: 0,
  tier: "easy",
});

test("colour moves onto its own colour, or into an empty tube", () => {
  const t = [[1, 1], [1], [], [2, 2, 2, 2]];
  assert.ok(canPour(t, 0, 1), "onto the same colour");
  assert.ok(canPour(t, 0, 2), "into an empty tube");
  assert.ok(!canPour(t, 0, 3), "not onto a different colour");
  assert.ok(!canPour(t, 2, 0), "an empty tube has nothing to give");
  assert.ok(!canPour(t, 0, 0), "and a tube cannot pour into itself");
});

test("a full tube takes nothing", () => {
  assert.ok(!canPour([[1], [1, 1, 1, 1]], 0, 1));
});

test("a pour moves the whole run of the top colour that fits", () => {
  assert.equal(pourSize([[2, 1, 1, 1], [1]], 0, 1), 3, "three of a kind, three spaces");
  assert.equal(pourSize([[2, 1, 1, 1], [1, 1, 1]], 0, 1), 1, "only one space left");
  assert.equal(runLength([2, 1, 1, 1]), 3);
  assert.equal(topOf([2, 1]), 1);
  assert.equal(topOf([]), null);
});

test("a pour that cannot happen returns the very same state", () => {
  const s = initialState(board([[1], [2]]));
  assert.equal(pour(s, 0, 1), s, "identity, so callers can tell nothing happened");
  assert.equal(pour(s, 0, 0), s);
  assert.equal(s.moves, 0);
});

test("undo walks all the way back to the start", () => {
  const p = board([[1, 2, 1, 2], [2, 1, 2, 1], [], []]);
  const start = initialState(p);
  let s = start;
  s = pour(s, 0, 2);
  s = pour(s, 1, 3);
  s = pour(s, 0, 3);
  assert.ok(s.moves > 0);
  while (s.moves > 0) s = undo(s);
  assert.deepEqual(s.tubes, start.tubes, "undo did not restore the tubes");
  assert.equal(undo(s), s, "and undo at the start is a no-op");
});

test("solved means every tube is empty or full of one colour", () => {
  assert.ok(isSolved(initialState(board([[1, 1, 1, 1], [2, 2, 2, 2], [], []]))));
  // three of a colour with nowhere else for the fourth is *not* finished
  assert.ok(!isSolved(initialState(board([[1, 1, 1], [1], [], []]))));
  assert.equal(done(initialState(board([[1, 1, 1, 1], [2, 2], [], []]))), 1);
});

test("a board with no legal pour is reported stuck", () => {
  // every tube full, none of them pure: nothing can move
  const jammed = initialState(board([[1, 2, 1, 2], [2, 1, 2, 1]]));
  assert.ok(stuck(jammed));
  assert.ok(!stuck(initialState(P)), "a fresh board always has somewhere to go");
  assert.ok(!stuck(initialState(board([[1, 1, 1, 1], [2, 2, 2, 2]]))), "solved is not stuck");
});

/* ── the search ───────────────────────────────────────────────────────────── */

test("interchangeable tubes fold together in the key", () => {
  /*
   * Colour Blocks is the cautionary tale: its state key was quietly wrong,
   * every board hashed the same, and the search called every one unsolvable.
   * Here the failure would be the mirror image — pouring into empty tube 4
   * rather than empty tube 3 would look like a new arrangement, and the search
   * would drown in copies of itself.
   */
  assert.equal(encode([[1], [], [2]]), encode([[2], [1], []]));
  assert.notEqual(encode([[1, 2]]), encode([[2, 1]]), "but order within a tube is real");
  assert.ok(!encode([[1], []]).includes("NaN"));
});

test("the moves offered never include one the rules would refuse", () => {
  for (const p of archive.slice(0, 10)) {
    for (const [a, b] of options(p.tubes)) {
      assert.ok(canPour(p.tubes, a, b), `${p.id}: offered an illegal pour ${a}→${b}`);
    }
  }
});

test("a hint names a pour that is legal from here", () => {
  const s = initialState(P);
  const move = nextPour(s, 400_000);
  assert.ok(move, "there is one on a fresh board");
  assert.ok(canPour(s.tubes, move![0], move![1]));
  assert.notEqual(pour(s, move![0], move![1]), s);
});

test("an impossible board is reported impossible, not guessed at", () => {
  // two colours, two full jammed tubes, no spares: nothing can ever move
  assert.equal(solve([[1, 2, 1, 2], [2, 1, 2, 1]], 200_000), null);
});

/* ── saving ───────────────────────────────────────────────────────────────── */

test("a save carries the tubes and the count of pours", () => {
  let s = initialState(P);
  s = pour(s, ...(nextPour(s, 400_000) as [number, number]));
  const back = initialState(P, toSave(s));
  assert.deepEqual(back.tubes, s.tubes);
  assert.equal(back.moves, s.moves);
  assert.deepEqual(back.past, [], "history is deliberately not saved");
});

test("a save holding different colours is refused", () => {
  /*
   * The guard against an older cut of the archive: restoring a board whose
   * colours no longer match would put a puzzle on screen that cannot be
   * finished, and nothing would say why.
   */
  const wrong = P.tubes.map((t) => t.map(() => 0));
  const back = initialState(P, { tubes: wrong, moves: 3 });
  assert.deepEqual(back.tubes, P.tubes, "fell back to the deal");
  assert.equal(back.moves, 0);

  const short = initialState(P, { tubes: [[0]], moves: 1 });
  assert.deepEqual(short.tubes, P.tubes, "and a save of the wrong shape too");
});
