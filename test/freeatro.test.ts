import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CELLS,
  COLUMNS,
  autoplay,
  canFinish,
  finish,
  cloneTable,
  deal,
  foundationReady,
  initialState,
  isRed,
  isWon,
  liftLimit,
  liftFrom,
  name,
  rankOf,
  newRun,
  bankRound,
  advanceRound,
  purse,
  targetFor,
  buy,
  owned,
  UPGRADES,
  cellsFor,
  baseMult,
  ROUND_RANKS,
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

const DEAL: Deal = { id: "FA-000", seed: 12345, ranks: 8, route: 0 };
const RUN = newRun();
/** A table built by hand for a rules test, at the round deck size. */
const bare = (): Table => ({
  columns: Array.from({ length: COLUMNS }, () => []),
  cells: [null, null, null, null],
  foundations: [-1, -1, -1, -1],
  ranks: ROUND_RANKS,
});

/* ── the deck ─────────────────────────────────────────────────────────────── */

test("a deal uses every card exactly once", () => {
  const t = deal(99, 13);
  const all = t.columns.flat().sort((a, b) => a - b);
  assert.equal(all.length, 52);
  assert.deepEqual(all, Array.from({ length: 52 }, (_, i) => i));
  assert.equal(t.cells.filter((c) => c === null).length, CELLS);
  assert.deepEqual(t.foundations, [-1, -1, -1, -1]);
});

test("the same seed always deals the same table", () => {
  assert.deepEqual(deal(4242).columns, deal(4242).columns);
  assert.notDeepEqual(deal(4242).columns, deal(4243).columns);
  assert.equal(deal(4242).columns.flat().length, ROUND_RANKS * 4, "a round is a short deck");
});

test("the columns are as even as fifty-two into eight goes", () => {
  const sizes = deal(7, 13).columns.map((c) => c.length).sort();
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
  const t: Table = { ...bare(), columns: Array.from({ length: COLUMNS }, () => [0]) };
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
  const s = initialState(DEAL, RUN);
  s.table.columns[0] = [0];   // A♠
  s.table.columns[1] = [1];   // 2♠
  const home = toFoundation(s, { pile: "column", index: 0 });
  assert.equal(home.table.foundations[0], 0);
  assert.equal(home.score.total, 1, "an ace is one chip at one multiplier");

  const early = toFoundation(s, { pile: "column", index: 1 });
  assert.equal(early, s, "the two cannot go before the ace");
});

test("a king scores thirteen times what an ace does", () => {
  let s = initialState(DEAL, RUN);
  s.table.columns[0] = [12];
  s.table.ranks = 13;
  s.table.foundations[0] = 11;
  s = toFoundation(s, { pile: "column", index: 0 });
  // a completed suit is also worth a point of multiplier, applied as it lands
  assert.equal(s.score.total, 13 * 2);
});

test("an illegal move returns the same state, so nothing counts it", () => {
  const s = initialState(DEAL, RUN);
  s.table.columns[0] = [0];
  s.table.columns[1] = [39 + 4]; // 5♣ onto A♠ is nonsense
  assert.equal(toColumn(s, { pile: "column", index: 1 }, 0, 1), s);
  assert.equal(s.moves, 0);
});

test("cells fill up and then refuse", () => {
  let s = initialState(DEAL, RUN);
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
  let s = initialState(DEAL, RUN);
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
  let s = initialState(DEAL, RUN);
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
  const s = initialState(DEAL, RUN);
  assert.equal(undo(s), s);
});

/* ── autoplay ─────────────────────────────────────────────────────────────── */

test("autoplay sends up only what can never be needed below", () => {
  let s = initialState(DEAL, RUN);
  s.table.columns = Array.from({ length: COLUMNS }, () => []);
  s.table.foundations = [0, 0, 0, 0];       // all four aces home
  s.table.columns[0] = [1];                  // 2♠ — safe, nothing needs it
  s.table.columns[1] = [13 + 5];             // 6♥ — not safe, blacks are only on ace
  s = autoplay(s);
  assert.equal(s.table.foundations[0], 1, "the two went up");
  assert.equal(s.table.columns[1].length, 1, "the six stayed put");
});

test("autoplay finishes a board that is already won in all but name", () => {
  let s = initialState(DEAL, RUN);
  s.table.columns = Array.from({ length: COLUMNS }, () => []);
  s.table.cells = [null, null, null, null];
  s.table.ranks = 13;
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
  const t: Table = { ...bare(), ranks: 13, foundations: [11, 12, 12, 12] };
  t.columns[0] = [12];
  assert.equal(solve(t), 1);
});

test("a board that cannot be won is reported as such, not guessed at", () => {
  // every column a king on a king: nothing stacks, nothing can be lifted, and
  // the cells cannot hold enough to dig anything out
  const t: Table = {
    ...bare(),
    ranks: 13,
    columns: [
      [12, 25], [38, 51], [11, 24], [37, 50],
      [10, 23], [36, 49], [9, 22], [35, 48],
    ],
    cells: [0, 13, 26, 39],
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
  const t = deal(1, 13);
  t.foundations = [4, -1, -1, -1];
  assert.ok(foundationReady(t, 5), "6♠ follows 5♠");
  assert.ok(!foundationReady(t, 6));
  assert.ok(foundationReady(t, 13), "any ace is welcome");
});

/* ── the run ──────────────────────────────────────────────────────────────── */

test("the purse pays for clearing a round and nothing for missing one", () => {
  const run = newRun();
  assert.equal(purse(run, targetFor(1) - 1, 1), 0, "just short is still short");
  assert.equal(purse(run, targetFor(1), 1), 3, "three for clearing it");
  assert.equal(purse(run, targetFor(1) + 100, 1), 5, "and one per fifty over");
});

test("the target climbs, so a head start stops being enough", () => {
  assert.ok(targetFor(2) > targetFor(1));
  assert.ok(targetFor(6) > targetFor(2));
});

test("an upgrade costs coins and stops at its maximum", () => {
  let run = { ...newRun(), coins: 100 };
  const before = run.coins;
  run = buy(run, "cell");
  assert.equal(owned(run, "cell"), 1);
  assert.equal(run.coins, before - 6);
  assert.equal(cellsFor(run), 5, "a bought cell is a real cell");

  run = buy(run, "cell");
  const maxed = run;
  run = buy(run, "cell");
  assert.equal(run, maxed, "two is the limit, and the third takes no money");
});

test("an upgrade you cannot afford is not sold to you", () => {
  const broke = { ...newRun(), coins: 1 };
  assert.equal(buy(broke, "cell"), broke);
});

test("a head start raises the multiplier a round opens on", () => {
  let run = { ...newRun(), coins: 20 };
  assert.equal(baseMult(run), 1);
  run = buy(run, "mult");
  assert.equal(baseMult(run), 2);
  const s = initialState(DEAL, run);
  assert.equal(s.score.mult, 2, "and the board opens there");
});

test("a short round is won when every suit reaches its top rank, not the king", () => {
  const s = initialState(DEAL, RUN);
  s.table.foundations = [7, 7, 7, 7];
  assert.ok(isWon(s.table), "ace to eight is the whole suit here");
  s.table.foundations = [7, 7, 7, 6];
  assert.ok(!isWon(s.table));
});

/* ── banking a round ──────────────────────────────────────────────────────── */

test("a round is banked when it ends, so the shop can spend what it earned", () => {
  const run = newRun();
  const score = targetFor(1) + 100;
  const banked = bankRound(run, score);
  assert.equal(banked.coins, purse(run, score, 1), "the payout is in the purse");
  assert.deepEqual(banked.scores, [score]);
  assert.equal(banked.round, 1, "and banking does not move the round on");
});

test("banking the same round twice pays it once", () => {
  // the reload-while-shopping case: the board remounts on an already-won round
  // and reports the win again
  const once = bankRound(newRun(), 700);
  const twice = bankRound(once, 700);
  assert.equal(twice, once, "identity — nothing was added");
  assert.equal(twice.coins, once.coins);
});

test("buying Deeper pockets cannot backdate the round already banked", () => {
  const run = newRun();
  const score = targetFor(1) + 200;
  const banked = bankRound(run, score);
  const after = buy({ ...banked, coins: banked.coins + 20 }, "purse");
  // the payout is already in `coins`; owning the upgrade now must not re-run it
  assert.equal(
    bankRound(after, score).coins,
    after.coins,
    "the round is spent, and buying does not re-open it"
  );
});

test("advancing moves the round and leaves the money alone", () => {
  const banked = bankRound(newRun(), 700);
  const next = advanceRound(banked);
  assert.equal(next.round, 2);
  assert.equal(next.coins, banked.coins);
  assert.deepEqual(next.scores, banked.scores);
});

test("a round-one shop has something to spend, which it never used to", () => {
  const cheapest = Math.min(...UPGRADES.map((u) => u.cost));

  // Scraping in exactly on the target pays the flat three and buys nothing.
  // That is deliberate rather than mean: the flat payment is for clearing, and
  // a round you barely survived should not also fund an upgrade.
  const scraped = bankRound(newRun(), targetFor(1));
  assert.equal(scraped.coins, 3);
  assert.ok(scraped.coins < cheapest, "a bare clear is not a shopping trip");

  // A comfortable clear is, and this is the case that used to be impossible:
  // the money was banked on the way *out* of the shop, so round one always
  // opened with nothing whatever the score.
  const played = bankRound(newRun(), targetFor(1) + 150);
  assert.ok(
    played.coins >= cheapest,
    `${played.coins} coins should cover a ${cheapest}-coin upgrade`
  );
});

/* ── the retuned curve ────────────────────────────────────────────────────── */

test("the target climbs and never repeats", () => {
  const targets = [1, 2, 3, 4, 5, 6, 7].map(targetFor);
  for (let i = 1; i < targets.length; i++) assert.ok(targets[i] > targets[i - 1]);
});

test("winning by accident does not clear a round", () => {
  // measured over all sixty deals by replaying the solver's route through this
  // same scoring code — see scripts/tune-freeatro.mjs
  const carelessMedian = 399;
  const carelessUpperQuartile = 446;
  assert.ok(
    targetFor(1) > carelessUpperQuartile,
    `round one at ${targetFor(1)} is inside the range a careless win reaches`
  );
  assert.ok(targetFor(1) > carelessMedian * 1.35, "and comfortably past the median of one");
});

/* ── picking up from a card ───────────────────────────────────────────────── */

test("a tap on a card takes that card and everything below it", () => {
  const t = bare();
  t.columns[0] = [12 + 26, 7, 13 + 6, 39 + 5]; // Kd, 8s, 7h, 6c
  assert.equal(liftFrom(t, 0, 3), 1, "the six alone");
  assert.equal(liftFrom(t, 0, 2), 2, "the seven and the six");
  assert.equal(liftFrom(t, 0, 1), 3, "the whole run");
  assert.equal(liftFrom(t, 0, 0), 0, "the king does not continue the run");
});

test("a pick-up refuses rather than trimming when the cells cannot carry it", () => {
  const t = bare();
  t.columns[0] = [7, 13 + 6, 39 + 5]; // 8s 7h 6c — an ordered three
  // every cell taken *and* no empty column: an empty column doubles the lift,
  // so leaving the other seven bare would have allowed 128 cards
  t.cells = [0, 1, 2, 3];
  for (let i = 1; i < COLUMNS; i++) t.columns[i] = [12];
  assert.equal(liftLimit(t), 1, "nothing to stage a move through");
  assert.equal(liftFrom(t, 0, 2), 1, "one still goes");
  assert.equal(liftFrom(t, 0, 0), 0, "three does not, and is not quietly cut to one");
});

test("an empty column offers nothing to pick up", () => {
  const t = bare();
  assert.equal(liftFrom(t, 0, 0), 0);
  assert.equal(liftFrom(t, 99, 0), 0, "and neither does a column that is not there");
});

/* ── finishing a decided board ────────────────────────────────────────────── */

test("a board that is over bar the clicking says so", () => {
  const t = bare();
  t.foundations = [5, 5, 5, 5];
  // each column holds the rest of one suit, in order, nothing in the way
  // bottom to top, so the card the foundation wants next is the one on top
  for (let suit = 0; suit < 4; suit++) t.columns[suit] = [suit * 13 + 7, suit * 13 + 6];
  assert.ok(canFinish(t), "every card can go home by rank from here");
});

test("a board with work still to do does not", () => {
  const t = bare();
  t.foundations = [-1, -1, -1, -1];
  t.columns[0] = [7, 0]; // the ace is under the eight
  assert.ok(!canFinish(t));
});

test("finishing plays it out and scores every card on the way", () => {
  const s = initialState(DEAL, RUN);
  s.table.columns = Array.from({ length: COLUMNS }, () => []);
  s.table.foundations = [6, 6, 6, 6];
  for (let suit = 0; suit < 4; suit++) s.table.columns[suit] = [suit * 13 + 7];
  assert.ok(canFinish(s.table));

  const done = finish(s);
  assert.ok(isWon(done.table), "the board is clear");
  assert.ok(done.score.total > s.score.total, "and the last four cards were scored");
  assert.equal(done.moves, s.moves + 4, "one move each, as a hand would play them");
});

test("finishing an already-won board does nothing", () => {
  const s = initialState(DEAL, RUN);
  s.table.columns = Array.from({ length: COLUMNS }, () => []);
  s.table.foundations = [7, 7, 7, 7];
  assert.equal(finish(s), s);
});
