import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CELLS,
  COLUMNS,
  autoplay,
  cloneTable,
  deal,
  foundationReady,
  initialState,
  isRed,
  isWon,
  liftLimit,
  name,
  rankOf,
  runLength,
  solve,
  stacks,
  suitOf,
  toCell,
  toColumn,
  toFoundation,
  undo,
  type Deal,
  type Table,
} from "../src/games/freeatro/engine.ts";

const DEAL: Deal = { id: "FA-000", seed: 12345, route: 0, target: 0 };

/* ── the deck ─────────────────────────────────────────────────────────────── */

test("a deal uses every card exactly once", () => {
  const t = deal(99);
  const all = t.columns.flat().sort((a, b) => a - b);
  assert.equal(all.length, 52);
  assert.deepEqual(all, Array.from({ length: 52 }, (_, i) => i));
  assert.equal(t.cells.filter((c) => c === null).length, CELLS);
  assert.deepEqual(t.foundations, [-1, -1, -1, -1]);
});

test("the same seed always deals the same table", () => {
  assert.deepEqual(deal(4242).columns, deal(4242).columns);
  assert.notDeepEqual(deal(4242).columns, deal(4243).columns);
});

test("the columns are as even as fifty-two into eight goes", () => {
  const sizes = deal(7).columns.map((c) => c.length).sort();
  assert.deepEqual(sizes, [6, 6, 6, 6, 7, 7, 7, 7]);
});

test("cards read the way they are written", () => {
  assert.equal(name(0), "A♠");
  assert.equal(name(12), "K♠");
  assert.equal(name(13), "A♥");
  assert.equal(name(51), "K♣");
  assert.ok(isRed(13) && isRed(26), "hearts and diamonds");
  assert.ok(!isRed(0) && !isRed(51), "spades and clubs");
  assert.equal(rankOf(25), 12);
  assert.equal(suitOf(25), 1);
});

/* ── the rules ────────────────────────────────────────────────────────────── */

test("a tableau run goes down a rank and alternates colour", () => {
  const blackSix = 5;      // 6♠
  const redFive = 13 + 4;  // 5♥
  const blackFive = 39 + 4; // 5♣
  assert.ok(stacks(blackSix, redFive), "6♠ takes 5♥");
  assert.ok(!stacks(blackSix, blackFive), "not the same colour");
  assert.ok(!stacks(redFive, blackSix), "and not upwards");
});

test("a lift is limited by the cells, and an empty column is worth double", () => {
  const t: Table = {
    columns: Array.from({ length: COLUMNS }, () => [0]),
    cells: [null, null, null, null],
    foundations: [-1, -1, -1, -1],
  };
  assert.equal(liftLimit(t), 5, "four cells free, no empty column");
  t.cells[0] = 1;
  assert.equal(liftLimit(t), 4);
  t.columns[7] = [];
  assert.equal(liftLimit(t), 8, "an empty column doubles it");
  assert.equal(liftLimit(t, true), 4, "unless that column is where it is going");
});

test("run length reads only the ordered tail", () => {
  const t = [12, 5, 13 + 4, 39 + 3]; // K♠, 6♠, 5♥, 4♣
  assert.equal(runLength(t), 3, "6♠ 5♥ 4♣ is a run; the king is not part of it");
  assert.equal(runLength([]), 0);
  assert.equal(runLength([7]), 1);
});

/* ── moving ───────────────────────────────────────────────────────────────── */

test("an ace goes home and nothing else does yet", () => {
  let s = initialState(DEAL);
  s.table.columns[0] = [0];   // A♠
  s.table.columns[1] = [1];   // 2♠
  const home = toFoundation(s, { pile: "column", index: 0 });
  assert.equal(home.table.foundations[0], 0);
  assert.equal(home.score.total, 1, "an ace is one chip at one multiplier");

  const early = toFoundation(s, { pile: "column", index: 1 });
  assert.equal(early, s, "the two cannot go before the ace");
});

test("a king scores thirteen times what an ace does", () => {
  let s = initialState(DEAL);
  s.table.columns[0] = [12];
  s.table.foundations[0] = 11;
  s = toFoundation(s, { pile: "column", index: 0 });
  // a completed suit is also worth a point of multiplier, applied as it lands
  assert.equal(s.score.total, 13 * 2);
});

test("an illegal move returns the same state, so nothing counts it", () => {
  const s = initialState(DEAL);
  s.table.columns[0] = [0];
  s.table.columns[1] = [39 + 4]; // 5♣ onto A♠ is nonsense
  assert.equal(toColumn(s, { pile: "column", index: 1 }, 0, 1), s);
  assert.equal(s.moves, 0);
});

test("cells fill up and then refuse", () => {
  let s = initialState(DEAL);
  const before = s.table.cells.filter((c) => c === null).length;
  s = toCell(s, 0);
  assert.equal(s.table.cells.filter((c) => c === null).length, before - 1);
  s = toCell(s, 0);
  s = toCell(s, 0);
  s = toCell(s, 0);
  const full = s;
  s = toCell(s, 0);
  assert.equal(s, full, "the fifth has nowhere to go");
});

test("building a run of three earns multiplier, and breaking it gives it back", () => {
  let s = initialState(DEAL);
  s.table.columns = Array.from({ length: COLUMNS }, () => []);
  s.table.columns[0] = [5, 13 + 4];      // 6♠ 5♥
  s.table.columns[1] = [39 + 3];         // 4♣
  s.table.columns[2] = [];
  s = toColumn(s, { pile: "column", index: 1 }, 0, 1);
  assert.equal(s.score.runs, 1, "6♠ 5♥ 4♣");
  assert.equal(s.score.mult, 2);

  s = toColumn(s, { pile: "column", index: 0 }, 2, 1); // take the 4 off again
  assert.equal(s.score.runs, 0, "a multiplier that only went up would reward churn");
  assert.equal(s.score.mult, 1);
});

test("undo puts the score back too", () => {
  let s = initialState(DEAL);
  s.table.columns[0] = [0];
  const start = s;
  s = toFoundation(s, { pile: "column", index: 0 });
  assert.equal(s.score.total, 1);
  const back = undo(s);
  assert.equal(back.score.total, 0);
  assert.equal(back.moves, 0);
  assert.deepEqual(back.table.foundations, start.table.foundations);
});

test("undo at the start does nothing", () => {
  const s = initialState(DEAL);
  assert.equal(undo(s), s);
});

/* ── autoplay ─────────────────────────────────────────────────────────────── */

test("autoplay sends up only what can never be needed below", () => {
  let s = initialState(DEAL);
  s.table.columns = Array.from({ length: COLUMNS }, () => []);
  s.table.foundations = [0, 0, 0, 0];       // all four aces home
  s.table.columns[0] = [1];                  // 2♠ — safe, nothing needs it
  s.table.columns[1] = [13 + 5];             // 6♥ — not safe, blacks are only on ace
  s = autoplay(s);
  assert.equal(s.table.foundations[0], 1, "the two went up");
  assert.equal(s.table.columns[1].length, 1, "the six stayed put");
});

test("autoplay finishes a board that is already won in all but name", () => {
  let s = initialState(DEAL);
  s.table.columns = Array.from({ length: COLUMNS }, () => []);
  s.table.cells = [null, null, null, null];
  s.table.foundations = [11, 11, 11, 11];
  s.table.columns[0] = [12, 25, 38, 51].slice(0, 1);
  s.table.columns[1] = [25];
  s.table.columns[2] = [38];
  s.table.columns[3] = [51];
  s = autoplay(s);
  assert.ok(isWon(s.table), "four kings, four foundations");
});

/* ── proving a deal ───────────────────────────────────────────────────────── */

test("a board one move from home is solved in one move", () => {
  const t: Table = {
    columns: Array.from({ length: COLUMNS }, () => []),
    cells: [null, null, null, null],
    foundations: [11, 12, 12, 12],
  };
  t.columns[0] = [12];
  assert.equal(solve(t), 1);
});

test("a board that cannot be won is reported as such, not guessed at", () => {
  // every column a king on a king: nothing stacks, nothing can be lifted, and
  // the cells cannot hold enough to dig anything out
  const t: Table = {
    columns: [
      [12, 25], [38, 51], [11, 24], [37, 50],
      [10, 23], [36, 49], [9, 22], [35, 48],
    ],
    cells: [0, 13, 26, 39],
    foundations: [-1, -1, -1, -1],
  };
  assert.equal(solve(t, 20_000), null);
});

test("cloning a table shares nothing with the original", () => {
  const a = deal(5);
  const b = cloneTable(a);
  b.columns[0].push(99);
  b.cells[0] = 7;
  b.foundations[0] = 3;
  assert.notEqual(a.columns[0].length, b.columns[0].length);
  assert.equal(a.cells[0], null);
  assert.equal(a.foundations[0], -1);
});

test("foundationReady only accepts the next card of that suit", () => {
  const t = deal(1);
  t.foundations = [4, -1, -1, -1];
  assert.ok(foundationReady(t, 5), "6♠ follows 5♠");
  assert.ok(!foundationReady(t, 6));
  assert.ok(foundationReady(t, 13), "any ace is welcome");
});
