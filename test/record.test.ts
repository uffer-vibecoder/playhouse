import { test } from "node:test";
import assert from "node:assert/strict";
import {
  codewordRecord,
  wordRecord,
  solveRecord,
  playerRecord,
} from "../src/lib/record.ts";

const slotOf = (p: { id: string }) => `s:${p.id}`;

/* ── codeword: finished or not, and no score ─────────────────────────────── */

test("codeword reports the archive and its themed sets", () => {
  const puzzles = [
    { id: "1", theme: "Garden" },
    { id: "2", theme: "Garden" },
    { id: "3", theme: "Weather" },
    { id: "4" },
  ];
  const r = codewordRecord("01", puzzles, new Set(["s:1", "s:2", "s:4"]), slotOf);
  assert.equal(r.shape, "archive");
  assert.deepEqual(r.archive, { total: 4, done: 3 });
  assert.deepEqual(r.sets, [
    { name: "Garden", done: 2, of: 2 },
    { name: "Weather", done: 0, of: 1 },
  ]);
});

test("codeword never reports a score, a grade or a percentage", () => {
  const r = codewordRecord("01", [{ id: "1" }], new Set(), slotOf);
  assert.equal(r.average, undefined);
  assert.equal(r.distribution, undefined);
  assert.match(r.note, /no score exists/);
});

/* ── word guessing: the distribution's shape is the point ────────────────── */

const wordSave = (guesses: number, solved: boolean) => ({
  entries: { guesses: Array(guesses).fill("XXXXX") },
  solved,
});

test("the distribution always has six buckets, zeros included", () => {
  const saves = new Map([["a", wordSave(3, true)]]);
  const r = wordRecord("02", saves, 6);
  assert.equal(r.distribution!.length, 6);
  assert.deepEqual(r.distribution, [0, 0, 1, 0, 0, 0]);
});

test("an unsolved puzzle with every try used is a failure, counted apart", () => {
  const saves = new Map([
    ["a", wordSave(3, true)],
    ["b", wordSave(6, false)], // out of tries — failed, and stays failed
  ]);
  const r = wordRecord("02", saves, 6);
  assert.equal(r.solved, 1);
  assert.equal(r.failed, 1);
  assert.equal(
    r.distribution!.reduce((a, b) => a + b, 0),
    1,
    "a failure must not appear in the distribution"
  );
});

test("a puzzle still in progress is neither solved nor failed", () => {
  const r = wordRecord("02", new Map([["a", wordSave(2, false)]]), 6);
  assert.equal(r.solved, 0);
  assert.equal(r.failed, 0);
});

test("the best result is the lowest guess count that happened", () => {
  const saves = new Map([
    ["a", wordSave(4, true)],
    ["b", wordSave(2, true)],
    ["c", wordSave(5, true)],
  ]);
  assert.match(wordRecord("02", saves, 6).note, /Best: 2 guesses/);
});

test("one guess reads as a guess, not guesses", () => {
  assert.match(wordRecord("02", new Map([["a", wordSave(1, true)]]), 6).note, /Best: 1 guess\./);
});

/* ── solve for x: the FIRST attempt is what counts ───────────────────────── */

test("the average uses first attempts, not current ones", () => {
  const puzzles = [{ id: "SX-001" }, { id: "SX-002" }];
  const saves = new Map([
    ["s:SX-001", { entries: { firstScore: 6 } }],
    ["s:SX-002", { entries: { firstScore: 10 } }],
  ]);
  const r = solveRecord("03", puzzles, saves, slotOf, 10);
  assert.equal(r.average, 8);
  assert.equal(r.outOf, 10);
});

test("a set with no recorded first attempt is left out, not counted as zero", () => {
  const puzzles = [{ id: "SX-001" }, { id: "SX-002" }];
  const saves = new Map([
    ["s:SX-001", { entries: { firstScore: 8 } }],
    ["s:SX-002", { entries: {} }], // started, never completed an attempt
  ]);
  const r = solveRecord("03", puzzles, saves, slotOf, 10);
  assert.equal(r.average, 8, "an incomplete set must not drag the average to 4");
  assert.equal(r.recent!.length, 1);
});

test("with nothing finished the average is null rather than zero", () => {
  const r = solveRecord("03", [{ id: "SX-001" }], new Map(), slotOf, 10);
  assert.equal(r.average, null);
  assert.deepEqual(r.recent, []);
});

test("recent is newest first and capped at five", () => {
  const puzzles = Array.from({ length: 8 }, (_, i) => ({ id: `SX-00${i + 1}` }));
  const saves = new Map(puzzles.map((p, i) => [slotOf(p), { entries: { firstScore: i } }]));
  const r = solveRecord("03", puzzles, saves, slotOf, 10);
  assert.equal(r.recent!.length, 5);
  assert.equal(r.recent![0].label, "Set 008", "newest first");
  assert.ok(r.recent![0].score > r.recent![4].score);
});

/* ── the player summary ──────────────────────────────────────────────────── */

test("untimed is a value, not a gap", () => {
  const p = playerRecord(96, []);
  assert.equal(p.finished, 96);
  assert.equal(p.timedCount, 0);
  assert.equal(p.untimedCount, 96, "every finish is untimed until the timer exists");
  assert.equal(p.timedAverage, null, "no timed solves means no average, not 0:00");
});

test("the average covers timed solves only", () => {
  // 96 finished but only two timed: the average is of the two, never of 96.
  const p = playerRecord(96, [60_000, 120_000]);
  assert.equal(p.timedCount, 2);
  assert.equal(p.untimedCount, 94);
  assert.equal(p.timedAverage, "1:30");
});

test("times format with a padded seconds field", () => {
  assert.equal(playerRecord(1, [65_000]).timedAverage, "1:05");
  assert.equal(playerRecord(1, [5_000]).timedAverage, "0:05");
});
