import { test } from "node:test";
import assert from "node:assert/strict";
import {
  stamps,
  earnedCount,
  share,
  nearest,
  type ArchiveEntry,
  type Games,
} from "../src/lib/achievements.ts";

const slotOf = (p: ArchiveEntry) => `g:${p.id}`;

const game = (id: string, name: string, puzzles: ArchiveEntry[]): Games => ({
  id,
  name,
  puzzles,
  slotOf: (p) => `${id}:${p.id}`,
});

const CODEWORD = game("codeword", "Codeword", [
  { id: "1", theme: "In the Garden" },
  { id: "2", theme: "In the Garden" },
  { id: "3", theme: "In the Garden" },
  { id: "4", theme: "Weather" },
  { id: "5", theme: "Weather" },
  { id: "6", theme: "Weather" },
  { id: "7" }, // untitled — belongs to no set
]);

const solvedOf = (...ids: string[]) => new Set(ids.map((i) => `codeword:${i}`));

/* ── sets ────────────────────────────────────────────────────────────────── */

test("a themed set completes when all of its puzzles are finished", () => {
  const all = stamps([CODEWORD], solvedOf("1", "2", "3"));
  const garden = all.find((s) => s.name === "In the Garden")!;
  assert.ok(garden.earned);
  assert.equal(garden.done, 3);
  assert.equal(garden.of, 3);
});

test("order within a set does not matter", () => {
  const forwards = stamps([CODEWORD], solvedOf("1", "2", "3"));
  const backwards = stamps([CODEWORD], solvedOf("3", "1", "2"));
  assert.deepEqual(forwards, backwards);
});

test("a part-finished set is not earned, and reports how far along it is", () => {
  const all = stamps([CODEWORD], solvedOf("4", "5"));
  const weather = all.find((s) => s.name === "Weather")!;
  assert.ok(!weather.earned);
  assert.equal(weather.done, 2);
  assert.equal(+share(weather).toFixed(3), 0.667);
});

test("untitled puzzles belong to no set but still count toward the archive", () => {
  const all = stamps([CODEWORD], solvedOf("7"));
  assert.equal(all.filter((s) => s.name === "In the Garden" || s.name === "Weather").length, 2);
  const archive = all.find((s) => s.id === "codeword:archive")!;
  assert.equal(archive.done, 1);
});

/* ── archives ────────────────────────────────────────────────────────────── */

test("an archive completes only when every puzzle in it is finished", () => {
  const almost = stamps([CODEWORD], solvedOf("1", "2", "3", "4", "5", "6"));
  assert.ok(!almost.find((s) => s.id === "codeword:archive")!.earned, "one left");

  const all = stamps([CODEWORD], solvedOf("1", "2", "3", "4", "5", "6", "7"));
  assert.ok(all.find((s) => s.id === "codeword:archive")!.earned);
});

test("an empty archive is not quietly awarded", () => {
  // of === 0 would make done/of a division by zero and read as complete
  const empty = stamps([game("new", "Something New", [])], new Set());
  const stamp = empty.find((s) => s.id === "new:archive")!;
  assert.ok(!stamp.earned);
  assert.equal(share(stamp), 0);
});

/* ── what unearned stamps must still say ─────────────────────────────────── */

test("an unearned stamp keeps its name and its requirement", () => {
  // Hiding these, or showing a locked silhouette, is what turns this into a
  // loyalty scheme. Everything unearned still says what it is and what it takes.
  for (const s of stamps([CODEWORD], new Set())) {
    assert.ok(s.name.length > 0, "a stamp with no name");
    assert.match(s.requirement, /Finish/, `no requirement on ${s.id}`);
    assert.ok(!s.earned);
  }
});

test("nothing is earned for turning up — every stamp needs a finish", () => {
  const none = stamps([CODEWORD], new Set());
  assert.equal(earnedCount(none), 0);
});

/* ── the summary helpers ─────────────────────────────────────────────────── */

test("earnedCount counts only what is finished", () => {
  const all = stamps([CODEWORD], solvedOf("1", "2", "3", "4"));
  assert.equal(earnedCount(all), 1); // In the Garden only
});

test("nearest counts puzzles left, not percentage", () => {
  // Garden is finished and excluded. Weather is 2/3 — one puzzle away. The
  // archive is 5/7 — a *higher* share, but two away. Ranking by share would
  // point at the archive and call it nearly done, which is the wrong answer
  // and gets wronger as an archive grows.
  const all = stamps([CODEWORD], solvedOf("1", "2", "3", "4", "5"));
  assert.equal(nearest(all)!.name, "Weather");
});

test("nearest prefers the smaller target when a big archive looks close", () => {
  // 78 of 80 done is 97.5%, but still two away; a set needing one must win.
  const big = game(
    "big",
    "Big",
    Array.from({ length: 80 }, (_, i) => ({
      id: String(i),
      theme: i < 3 ? "Set" : undefined,
    }))
  );
  const solved = new Set<string>();
  for (let i = 0; i < 78; i++) if (i !== 2 && i !== 79) solved.add(`big:${i}`);
  const near = nearest(stamps([big], solved))!;
  assert.equal(near.name, "Set", "a 97.5% archive is still further away than a set with one left");
});

test("nearest is null when nothing has been started", () => {
  assert.equal(nearest(stamps([CODEWORD], new Set())), null);
});

test("nearest ignores a set with no progress at all", () => {
  const all = stamps([CODEWORD], solvedOf("4"));
  const near = nearest(all)!;
  assert.ok(near.done > 0, "picked something untouched");
});

/* ── several games ───────────────────────────────────────────────────────── */

test("each game contributes its own archive stamp", () => {
  const other = game("slide", "Sliding Tiles", [{ id: "a" }, { id: "b" }]);
  const all = stamps([CODEWORD, other], new Set(["slide:a", "slide:b"]));
  assert.ok(all.find((s) => s.id === "slide:archive")!.earned);
  assert.ok(!all.find((s) => s.id === "codeword:archive")!.earned);
});
