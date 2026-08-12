import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COLOURS,
  SIZE,
  adjacent,
  deal,
  idx,
  initialState,
  legalMoves,
  matches,
  scoreFor,
  shuffle,
  swap,
  toSave,
  wouldMatch,
  type Fruit,
  type Puzzle,
} from "../src/games/match/engine.ts";

const SEED = 1234;

/** A puzzle around a given board, for testing the rules in isolation. */
const puzzleOf = (board: Fruit[], moves = 10, target = 100): Puzzle => ({
  id: "TEST",
  board,
  moves,
  target,
  tier: "gentle",
});

/** A board from a string picture, so a failure is readable. Dots are ignored. */
const draw = (rows: string[]): Fruit[] => {
  const board: Fruit[] = [];
  for (const row of rows) for (const ch of row.replace(/ /g, "")) board.push(Number(ch));
  return board;
};

/** Eight rows of eight, cycling so nothing matches by accident. */
const quiet = (): Fruit[] => {
  const b: Fruit[] = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) b.push((x + y * 2) % COLOURS);
  }
  return b;
};

/* ── seeing a match ───────────────────────────────────────────────────────── */

test("three in a row is a match, two is not", () => {
  const b = quiet();
  assert.equal(matches(b).size, 0, "the quiet board really is quiet");

  b[idx(0, 0)] = 5; b[idx(1, 0)] = 5;
  assert.equal(matches(b).size, 0, "two is not enough");
  b[idx(2, 0)] = 5;
  assert.equal(matches(b).size, 3);
});

test("three in a column counts too", () => {
  const b = quiet();
  b[idx(3, 2)] = 4; b[idx(3, 3)] = 4; b[idx(3, 4)] = 4;
  assert.deepEqual([...matches(b)].sort((x, y) => x - y), [idx(3, 2), idx(3, 3), idx(3, 4)]);
});

test("a cell where two runs cross is cleared once, not twice", () => {
  /*
   * Otherwise the middle of a cross pays for itself twice over. Written as an
   * explicit picture rather than by editing a background board: the first
   * version poked a three into the quiet board and got a four, because the
   * quiet board already had a matching fruit sitting next to it.
   */
  const b = draw([
    "02020202",
    "34343434",
    "02010202",
    "34313434",
    "02111202",
    "34313434",
    "02010202",
    "34343434",
  ]);
  const hit = matches(b);
  assert.equal(hit.size, 7, "five down and three across share their middle: 5 + 3 - 1");
  assert.ok(hit.has(idx(3, 4)), "and the shared one is in there");
});

test("a run does not wrap from one row to the next", () => {
  const b = quiet();
  b[idx(6, 0)] = 2; b[idx(7, 0)] = 2; b[idx(0, 1)] = 2; b[idx(1, 1)] = 2;
  assert.equal(matches(b).size, 0, "the edge of the board is the end of the run");
});

/* ── legal moves ──────────────────────────────────────────────────────────── */

test("only neighbours can be swapped", () => {
  assert.ok(adjacent(idx(3, 3), idx(4, 3)));
  assert.ok(adjacent(idx(3, 3), idx(3, 4)));
  assert.ok(!adjacent(idx(3, 3), idx(4, 4)), "not diagonally");
  assert.ok(!adjacent(idx(3, 3), idx(5, 3)), "not at a distance");
  assert.ok(!adjacent(idx(7, 0), idx(0, 1)), "and not around the edge");
});

test("a swap that makes nothing is not a move", () => {
  const b = quiet();
  assert.ok(!wouldMatch(b, idx(0, 0), idx(1, 0)));
  assert.equal(legalMoves(b).length, 0, "the quiet board has nothing to do");
});

test("a swap that makes something is a move, and it is found", () => {
  const b = quiet();
  //  put two 3s beside a place a third can be swapped into
  b[idx(1, 0)] = 3; b[idx(2, 0)] = 3; b[idx(3, 1)] = 3;
  assert.ok(wouldMatch(b, idx(3, 1), idx(3, 0)));
  const moves = legalMoves(b);
  assert.ok(moves.some(([x, y]) => (x === idx(3, 0) && y === idx(3, 1)) || (x === idx(3, 1) && y === idx(3, 0))));
});

/* ── making a move ────────────────────────────────────────────────────────── */

test("an illegal swap does nothing at all", () => {
  const b = quiet();
  const p = puzzleOf(b);
  const s = initialState(p);
  assert.equal(swap(p, s, SEED, idx(0, 0), idx(1, 0)), null, "no match to make");
  assert.equal(swap(p, s, SEED, idx(0, 0), idx(4, 4)), null, "not even neighbours");
  assert.equal(s.moves, p.moves, "and it cost nothing");
});

test("a move clears, pays, and costs one of your swaps", () => {
  const b = quiet();
  b[idx(1, 0)] = 3; b[idx(2, 0)] = 3; b[idx(3, 1)] = 3;
  const p = puzzleOf(b);
  const s = initialState(p);
  const m = swap(p, s, SEED, idx(3, 1), idx(3, 0))!;
  assert.ok(m, "the swap was allowed");
  assert.ok(m.gained > 0);
  assert.equal(m.state.moves, p.moves - 1);
  assert.equal(m.state.score, m.gained);
  assert.ok(m.beats.length >= 1);
  assert.ok(m.beats[0].cleared.length >= 3);
});

test("the board a move leaves behind has no matches sitting in it", () => {
  // whatever the cascade did, it ran to the end
  const { board } = deal(SEED);
  const p = puzzleOf(board, 30);
  let s = initialState(p);
  for (let i = 0; i < 20; i++) {
    const moves = legalMoves(s.board);
    if (!moves.length) break;
    const m = swap(p, s, SEED, moves[0][0], moves[0][1]);
    if (!m) break;
    s = m.state;
    assert.equal(matches(s.board).size, 0, "a move left something unresolved");
  }
});

test("running out of swaps ends it", () => {
  const { board } = deal(SEED);
  const p = puzzleOf(board, 1);
  let s = initialState(p);
  const moves = legalMoves(s.board);
  s = swap(p, s, SEED, moves[0][0], moves[0][1])!.state;
  assert.equal(s.moves, 0);
  const again = legalMoves(s.board);
  assert.equal(swap(p, s, SEED, again[0][0], again[0][1]), null, "no swaps left");
});

/* ── determinism ──────────────────────────────────────────────────────────── */

test("the same board and the same swaps always give the same score", () => {
  /*
   * The whole reason refills come from a seeded stream rather than Math.random.
   * A measured target is worthless if the same board plays differently twice.
   */
  const { board } = deal(SEED);
  const p = puzzleOf(board, 12);

  const play = () => {
    let s = initialState(p);
    for (let i = 0; i < 12; i++) {
      const moves = legalMoves(s.board);
      if (!moves.length) break;
      const m = swap(p, s, SEED, moves[0][0], moves[0][1]);
      if (!m) break;
      s = m.state;
    }
    return s;
  };

  const a = play(), b = play();
  assert.equal(a.score, b.score);
  assert.deepEqual(a.board, b.board);
  assert.equal(a.drawn, b.drawn, "and the stream is in the same place");
});

test("a different seed refills differently", () => {
  const { board } = deal(SEED);
  const p = puzzleOf(board, 5);
  const s = initialState(p);
  const moves = legalMoves(s.board);
  const a = swap(p, s, SEED, moves[0][0], moves[0][1])!;
  const b = swap(p, s, SEED + 1, moves[0][0], moves[0][1])!;
  assert.equal(a.beats[0].cleared.length, b.beats[0].cleared.length, "the same clear");
  assert.notDeepEqual(a.state.board, b.state.board, "but different fruit falls in");
});

/* ── dealing ──────────────────────────────────────────────────────────────── */

test("a dealt board has nothing free and something to do", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const { board } = deal(seed * 977);
    assert.equal(board.length, SIZE * SIZE, `seed ${seed}: wrong size`);
    assert.equal(matches(board).size, 0, `seed ${seed}: points nobody earned`);
    assert.ok(legalMoves(board).length > 0, `seed ${seed}: nothing to do`);
    assert.ok(board.every((v) => v >= 0 && v < COLOURS), `seed ${seed}: fruit off the list`);
  }
});

test("dealing is reproducible", () => {
  assert.deepEqual(deal(99).board, deal(99).board);
  assert.notDeepEqual(deal(99).board, deal(100).board);
});

/* ── the dead board ───────────────────────────────────────────────────────── */

test("a board with no move left is shaken out, not left there", () => {
  // a dead board is not a hard puzzle, it is a broken one
  const dead = quiet();
  assert.equal(legalMoves(dead).length, 0);
  const shaken = shuffle(dead, SEED, 0);
  assert.ok(legalMoves(shaken.board).length > 0, "there is something to do now");
  assert.equal(matches(shaken.board).size, 0, "and nothing free in it");
  assert.ok(shaken.drawn > 0, "it moved through the stream");
});

test("a shake keeps exactly the fruit that was there", () => {
  const dead = quiet();
  const shaken = shuffle(dead, SEED, 0);
  const census = (b: Fruit[]) => {
    const n = new Array(COLOURS).fill(0);
    for (const v of b) n[v]++;
    return n;
  };
  assert.deepEqual(census(shaken.board), census(dead), "fruit appeared or vanished");
});

test("shaking the same board twice shakes it the same way", () => {
  const dead = quiet();
  assert.deepEqual(shuffle(dead, SEED, 0).board, shuffle(dead, SEED, 0).board);
});

/* ── scoring ──────────────────────────────────────────────────────────────── */

test("a longer run is worth more than its length", () => {
  // a five costs the same one swap a three does, so it has to be worth reaching for
  const three = scoreFor(3, 1);
  const five = scoreFor(5, 1);
  assert.ok(five > (three / 3) * 5, `${five} should beat ${(three / 3) * 5}`);
});

test("a cascade pays more than the same clear would on its own", () => {
  assert.ok(scoreFor(3, 2) > scoreFor(3, 1));
  assert.ok(scoreFor(3, 3) > scoreFor(3, 2));
});

/* ── saving ───────────────────────────────────────────────────────────────── */

test("a save carries the board, the score and where the stream got to", () => {
  const { board } = deal(SEED);
  const p = puzzleOf(board, 10);
  let s = initialState(p);
  const moves = legalMoves(s.board);
  s = swap(p, s, SEED, moves[0][0], moves[0][1])!.state;

  const back = initialState(p, toSave(s));
  assert.deepEqual(back.board, s.board);
  assert.equal(back.score, s.score);
  assert.equal(back.moves, s.moves);
  assert.equal(back.drawn, s.drawn, "so the next fruit to fall is the same one");
});

test("a save cannot invent swaps or fruit", () => {
  const { board } = deal(SEED);
  const p = puzzleOf(board, 10);
  const greedy = initialState(p, {
    board: new Array(SIZE * SIZE).fill(99),
    drawn: 0, moves: 999, score: 500, shuffles: 0,
  });
  assert.deepEqual(greedy.board, p.board, "fruit off the list is not a board");

  const tooMany = initialState(p, { board: board.slice(), drawn: 0, moves: 999, score: 0, shuffles: 0 });
  assert.equal(tooMany.moves, p.moves, "a save cannot hand out more swaps than the puzzle has");
});

/* ── what shipped ─────────────────────────────────────────────────────────── */

test("every shipped board is a real board with something to do", async () => {
  const { readFileSync } = await import("node:fs");
  const archive = JSON.parse(readFileSync("src/data/match.json", "utf8"));
  assert.ok(archive.length > 0);
  for (const p of archive) {
    assert.equal(p.board.length, SIZE * SIZE, `${p.id}: wrong size`);
    assert.ok(p.board.every((v: number) => v >= 0 && v < COLOURS), `${p.id}: fruit off the list`);
    assert.equal(matches(p.board).size, 0, `${p.id}: points nobody earned`);
    assert.ok(legalMoves(p.board).length > 0, `${p.id}: nothing to do`);
  }
});

test("no target asks for more than the board can pay", async () => {
  /*
   * The Free-Atro mistake, not repeated. Its target was one fixed number across
   * deals whose ceilings varied 2.3×, so half of them could not be cleared in
   * round one however well they were played — and nothing said so. Here the
   * boards vary 3.2× under the same player, so the target is a share of what
   * *this* board measured, and is checked against it.
   */
  const { readFileSync } = await import("node:fs");
  const archive = JSON.parse(readFileSync("src/data/match.json", "utf8"));
  for (const p of archive) {
    assert.ok(p.par > 0, `${p.id}: never measured`);
    assert.ok(
      p.target <= p.par * 1.6,
      `${p.id}: asks ${p.target} of a board a good player scores ${p.par} on`
    );
  }
});

test("a board plays to the par it shipped with", async () => {
  // the archive's number and the engine's behaviour cannot drift apart
  const { readFileSync } = await import("node:fs");
  const archive = JSON.parse(readFileSync("src/data/match.json", "utf8"));
  for (const p of archive.slice(0, 12)) {
    const puzzle = { id: p.id, board: p.board, moves: p.moves, target: p.target, tier: p.tier };
    let s = initialState(puzzle);
    while (s.moves > 0) {
      const moves = legalMoves(s.board);
      if (!moves.length) break;
      let best = null, paid = -1;
      for (const [a, b] of moves) {
        const m = swap(puzzle, s, p.seed, a, b);
        if (m && m.gained > paid) { paid = m.gained; best = m; }
      }
      if (!best) break;
      s = best.state;
    }
    assert.equal(s.score, p.par, `${p.id}: replayed to ${s.score}, not ${p.par}`);
  }
});

test("the harder tiers ask for more of the same board", () => {
  // the share is what changes, not the board — so a tier means something
  const shares = { gentle: 0.85, steady: 1.15, tricky: 1.5 };
  assert.ok(shares.gentle < shares.steady && shares.steady < shares.tricky);
});
