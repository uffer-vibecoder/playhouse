import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SIZE,
  colOf,
  conflicts,
  countSolutions,
  deduce,
  erase,
  initialState,
  isFull,
  isGiven,
  HINTS,
  hasNote,
  hint,
  hintsLeft,
  isSolved,
  mistakes,
  nextStep,
  note,
  notesIn,
  peers,
  progress,
  rowOf,
  solve,
  toSave,
  toggle,
  write,
  type Puzzle,
} from "../src/games/jigsaw/engine.ts";

const archive: Puzzle[] = JSON.parse(readFileSync("src/data/jigsaw.json", "utf8"));
const P = archive[0];
const CELLS = SIZE * SIZE;

/* ── the shapes ───────────────────────────────────────────────────────────── */

test("nine shapes of nine cells, covering the board exactly once", () => {
  for (const p of archive) {
    assert.equal(p.regions.length, CELLS, p.id);
    const count = new Array(9).fill(0);
    for (const g of p.regions) {
      assert.ok(Number.isInteger(g) && g >= 0 && g < 9, `${p.id}: region ${g}`);
      count[g]++;
    }
    assert.deepEqual(count, new Array(9).fill(9), `${p.id}: shapes are not all nine cells`);
  }
});

test("every shape is one connected piece", () => {
  // the whole point of the swap-based generator: a shape that comes apart is
  // not a shape, and growing regions from seeds produced them constantly
  const neighbours = (c: number) => {
    const x = colOf(c), y = rowOf(c);
    const out: number[] = [];
    if (x > 0) out.push(c - 1);
    if (x < SIZE - 1) out.push(c + 1);
    if (y > 0) out.push(c - SIZE);
    if (y < SIZE - 1) out.push(c + SIZE);
    return out;
  };
  for (const p of archive) {
    for (let g = 0; g < 9; g++) {
      const cells = [...p.regions.keys()].filter((c) => p.regions[c] === g);
      const seen = new Set([cells[0]]);
      const stack = [cells[0]];
      while (stack.length) {
        const c = stack.pop()!;
        for (const n of neighbours(c))
          if (p.regions[n] === g && !seen.has(n)) { seen.add(n); stack.push(n); }
      }
      assert.equal(seen.size, 9, `${p.id}: shape ${g} is in ${9 - seen.size + 1} pieces`);
    }
  }
});

test("no shape is a snake down one line", () => {
  for (const p of archive) {
    for (let g = 0; g < 9; g++) {
      const rows = new Array(9).fill(0), cols = new Array(9).fill(0);
      for (let c = 0; c < CELLS; c++) if (p.regions[c] === g) { rows[rowOf(c)]++; cols[colOf(c)]++; }
      assert.ok(Math.max(...rows, ...cols) <= 4, `${p.id}: shape ${g} puts five in one line`);
    }
  }
});

test("no board is just plain sudoku in disguise", () => {
  for (const p of archive) {
    const boxy = p.regions.every((g, c) => g === Math.floor(rowOf(c) / 3) * 3 + Math.floor(colOf(c) / 3));
    assert.ok(!boxy, `${p.id} is nine 3×3 boxes`);
  }
});

/* ── the answers ──────────────────────────────────────────────────────────── */

test("every shipped answer really is an answer", () => {
  for (const p of archive) {
    for (let i = 0; i < SIZE; i++) {
      const row = new Set<number>(), col = new Set<number>(), reg = new Set<number>();
      for (let c = 0; c < CELLS; c++) {
        if (rowOf(c) === i) row.add(p.solution[c]);
        if (colOf(c) === i) col.add(p.solution[c]);
        if (p.regions[c] === i) reg.add(p.solution[c]);
      }
      assert.equal(row.size, 9, `${p.id}: row ${i}`);
      assert.equal(col.size, 9, `${p.id}: column ${i}`);
      assert.equal(reg.size, 9, `${p.id}: shape ${i}`);
    }
  }
});

test("the clues agree with the answer, and there are as many as claimed", () => {
  for (const p of archive) {
    let clues = 0;
    for (let c = 0; c < CELLS; c++) {
      if (!p.given[c]) continue;
      clues++;
      assert.equal(p.given[c], p.solution[c], `${p.id}: clue at ${c} contradicts the answer`);
    }
    assert.equal(clues, p.clues, p.id);
  }
});

test("every board has exactly one answer", () => {
  for (const p of archive) {
    const { n, capped } = countSolutions(p.regions, p.given, 2, 400_000);
    assert.ok(!capped, `${p.id}: could not be proved either way`);
    assert.equal(n, 1, `${p.id}`);
  }
});

test("every board can be reasoned to the end, with no guessing", () => {
  // the bar that matters. Digging against uniqueness alone gave boards of
  // fourteen clues that were perfectly unique and unfinishable by a person
  for (const p of archive) {
    const { solved, grid } = deduce(p.regions, p.given);
    assert.ok(solved, `${p.id} needs a guess somewhere`);
    assert.deepEqual(grid, p.solution, `${p.id} reasons out to a different grid`);
  }
});

test("the tier a board claims is the tier it measures", () => {
  for (const p of archive) {
    const { steps } = deduce(p.regions, p.given);
    const want =
      steps.hidden === 0 ? (p.clues >= 34 ? "easy" : "gentle")
      : steps.hidden <= 18 ? "steady"
      : "tricky";
    assert.equal(
      p.tier, want,
      `${p.id} claims ${p.tier}, needs ${steps.hidden} hidden singles from ${p.clues} clues`
    );
  }
});

test("an easy board is gentle reasoning with much more of it already filled in", () => {
  const easy = archive.filter((p) => p.tier === "easy");
  assert.ok(easy.length > 0, "there are some");
  for (const p of easy) {
    assert.ok(deduce(p.regions, p.given, ["naked"]).solved, `${p.id} is not easy`);
    assert.ok(p.clues >= 34, `${p.id} calls itself easy with ${p.clues} clues`);
  }
});

test("a gentle board never needs the harder move", () => {
  const gentle = archive.filter((p) => p.tier === "gentle" || p.tier === "easy");
  assert.ok(gentle.length > 0, "there are some");
  for (const p of gentle) {
    assert.ok(deduce(p.regions, p.given, ["naked"]).solved, `${p.id} is not gentle`);
  }
});

/* ── the solver ───────────────────────────────────────────────────────────── */

test("the solver finds the shipped answer from the shipped clues", () => {
  for (const p of archive.slice(0, 12)) {
    assert.deepEqual(solve(p.regions, p.given, 400_000), p.solution, p.id);
  }
});

test("an impossible board is reported impossible, not guessed at", () => {
  // two of the same number in one row: nothing can complete it
  const given = new Array(CELLS).fill(0);
  given[0] = 5;
  given[1] = 5;
  assert.equal(solve(P.regions, given, 200_000), null);
});

test("taking a clue away leaves more than one answer, or the dig went too far", () => {
  // every remaining clue on a minimal board is load-bearing
  const tricky = archive.find((p) => p.tier === "tricky")!;
  const at = tricky.given.findIndex((v) => v !== 0);
  const thinner = [...tricky.given];
  thinner[at] = 0;
  const { n } = countSolutions(tricky.regions, thinner, 2, 400_000);
  assert.ok(n >= 1, "still solvable at least one way");
});

/* ── playing ──────────────────────────────────────────────────────────────── */

const blank = (p: Puzzle) => p.given.findIndex((v) => v === 0);
/** a state with given entries and no pencil marks */
const filled = (entries: number[]) => ({ entries, marks: new Array(CELLS).fill(0), shown: [] });

test("a clue cannot be written over", () => {
  const at = P.given.findIndex((v) => v !== 0);
  const s = initialState(P);
  assert.ok(isGiven(P, at));
  assert.equal(write(P, s, at, 4), s, "identity, so callers can tell nothing happened");
  assert.equal(erase(P, s, at), s);
});

test("writing, changing and rubbing out an empty cell", () => {
  const at = blank(P);
  let s = initialState(P);
  s = write(P, s, at, 7);
  assert.equal(s.entries[at], 7);
  s = write(P, s, at, 3);
  assert.equal(s.entries[at], 3, "changed, not refused");
  s = erase(P, s, at);
  assert.equal(s.entries[at], 0);
});

test("the same number twice rubs it out", () => {
  const at = blank(P);
  const s = toggle(P, initialState(P), at, 6);
  assert.equal(s.entries[at], 6);
  assert.equal(toggle(P, s, at, 6).entries[at], 0);
  assert.equal(toggle(P, s, at, 2).entries[at], 2, "a different number just replaces it");
});

test("a clash is reported, not prevented", () => {
  // putting it in and seeing what breaks is how sudoku is actually solved
  const at = blank(P);
  const wrong = P.solution[at] === 1 ? 2 : 1;
  const other = peers(P.regions, at).find((c) => P.given[c] === wrong);
  if (other === undefined) return; // this board has no clue of that value nearby
  const s = write(P, initialState(P), at, wrong);
  const bad = conflicts(P, s);
  assert.ok(bad.has(at), "the cell just written is flagged");
  assert.ok(bad.has(other), "and so is the one it clashes with");
});

test("a board filled in correctly has no clash and is solved", () => {
  const s = filled([...P.solution]);
  assert.equal(conflicts(P, s).size, 0);
  assert.ok(isFull(s));
  assert.ok(isSolved(P, s));
});

test("a full board that is wrong is not solved", () => {
  const entries = [...P.solution];
  const at = blank(P);
  const other = peers(P.regions, at).find((c) => !isGiven(P, c))!;
  [entries[at], entries[other]] = [entries[other], entries[at]];
  const s = filled(entries);
  assert.ok(isFull(s));
  assert.ok(!isSolved(P, s), "full is not the same as finished");
});

test("progress counts the cells you filled, not the ones you were given", () => {
  const s = initialState(P);
  const { done, total } = progress(P, s);
  assert.equal(done, 0);
  assert.equal(total, 81 - P.clues);
  const at = blank(P);
  assert.equal(progress(P, write(P, s, at, P.solution[at])).done, 1);
  assert.equal(
    progress(P, write(P, s, at, P.solution[at] === 9 ? 1 : 9)).done,
    0,
    "a wrong answer is not progress"
  );
});

/* ── pencil marks ─────────────────────────────────────────────────────────── */

test("a note goes in and comes out again", () => {
  const at = blank(P);
  let s = note(P, initialState(P), at, 4);
  assert.ok(hasNote(s, at, 4));
  assert.deepEqual(notesIn(s, at), [4]);
  s = note(P, s, at, 7);
  assert.deepEqual(notesIn(s, at), [4, 7], "notes are kept in order, not in the order typed");
  s = note(P, s, at, 4);
  assert.deepEqual(notesIn(s, at), [7], "the same note twice rubs it out");
});

test("all nine can be pencilled into one cell", () => {
  const at = blank(P);
  let s = initialState(P);
  for (let v = 1; v <= 9; v++) s = note(P, s, at, v);
  assert.deepEqual(notesIn(s, at), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test("notes cannot be written on a clue, or over an answer", () => {
  const given = P.given.findIndex((v) => v !== 0);
  const s0 = initialState(P);
  assert.equal(note(P, s0, given, 3), s0, "a clue takes no notes");

  const at = blank(P);
  const written = write(P, s0, at, 5);
  assert.equal(note(P, written, at, 3), written, "and neither does a cell with a number in it");
});

test("writing a number clears that cell's notes and leaves every other cell alone", () => {
  const at = blank(P);
  const other = peers(P.regions, at).find((c) => !isGiven(P, c))!;
  let s = initialState(P);
  s = note(P, s, at, 2);
  s = note(P, s, other, 2);
  s = write(P, s, at, 2);
  assert.deepEqual(notesIn(s, at), [], "the notes here were about what might go here");
  assert.deepEqual(notesIn(s, other), [2], "notes elsewhere are the player's to keep");
});

test("erase takes the number first, then the notes", () => {
  const at = blank(P);
  let s = note(P, note(P, initialState(P), at, 1), at, 8);
  s = write(P, s, at, 3);
  s = erase(P, s, at);
  assert.equal(s.entries[at], 0, "the number goes");
  s = note(P, s, at, 1);
  s = erase(P, s, at);
  assert.deepEqual(notesIn(s, at), [], "and a second erase takes the notes");
});

/* ── saving ───────────────────────────────────────────────────────────────── */

test("notes survive a save, and a save cannot pencil on a clue", () => {
  const at = blank(P);
  const given = P.given.findIndex((v) => v !== 0);
  const s = note(P, note(P, initialState(P), at, 3), at, 9);
  const back = initialState(P, toSave(P, s));
  assert.deepEqual(notesIn(back, at), [3, 9]);

  const junk = new Array(CELLS).fill(0);
  junk[given] = 0b1111111110;
  const forged = initialState(P, { entries: new Array(CELLS).fill(0), marks: junk });
  assert.deepEqual(notesIn(forged, given), [], "a clue has nothing to decide");
});

test("a save with no notes at all still loads", () => {
  // every save written before pencil marks existed looks like this
  const back = initialState(P, { entries: new Array(CELLS).fill(0) });
  assert.deepEqual(back.entries, [...P.given]);
  assert.ok(back.marks.every((m) => m === 0));
});

test("a save carries what you wrote and nothing you were given", () => {
  const at = blank(P);
  const s = write(P, initialState(P), at, 5);
  const saved = toSave(P, s);
  assert.equal(saved.entries[at], 5);
  assert.ok(saved.entries.every((v, c) => (isGiven(P, c) ? v === 0 : true)), "clues are not stored twice");

  const back = initialState(P, saved);
  assert.deepEqual(back.entries, s.entries);
});

test("a save can never overwrite a clue", () => {
  // an older cut of the archive could otherwise blank a given and leave a
  // board that cannot be finished
  const at = P.given.findIndex((v) => v !== 0);
  const junk = new Array(CELLS).fill(0);
  junk[at] = P.given[at] === 9 ? 1 : 9;
  const back = initialState(P, { entries: junk });
  assert.equal(back.entries[at], P.given[at]);
});

test("a save of the wrong shape is ignored rather than trusted", () => {
  const back = initialState(P, { entries: [1, 2, 3] });
  assert.deepEqual(back.entries, [...P.given]);
});

/* ── hints ────────────────────────────────────────────────────────────────── */

test("a hint fills the next square that can actually be worked out", () => {
  const s = initialState(P);
  const step = nextStep(P, s);
  assert.equal(step.kind, "cell");
  if (step.kind !== "cell") return;
  assert.equal(step.value, P.solution[step.cell], "and it fills in the right number");
  assert.equal(s.entries[step.cell], 0, "into a square that was empty");

  const after = hint(P, s);
  assert.equal(after.entries[step.cell], step.value);
  assert.deepEqual(after.shown, [step.cell]);
});

test("only three, and then nothing", () => {
  let s = initialState(P);
  assert.equal(hintsLeft(s), HINTS);
  for (let i = 1; i <= HINTS; i++) {
    s = hint(P, s);
    assert.equal(hintsLeft(s), HINTS - i);
  }
  assert.equal(nextStep(P, s).kind, "none");
  assert.equal(hint(P, s), s, "the fourth ask changes nothing at all");
});

test("a hint refuses to reason from a board with a mistake on it", () => {
  // reasoning from a wrong number derives more wrong numbers, so it says there
  // is one instead — and does not say which, because that would be the answer
  const at = blank(P);
  const wrong = P.solution[at] === 9 ? 1 : 9;
  const s = write(P, initialState(P), at, wrong);
  const step = nextStep(P, s);
  assert.equal(step.kind, "mistake");
  if (step.kind === "mistake") assert.equal(step.count, 1);
  assert.equal(hint(P, s), s, "and it costs nothing");
  assert.deepEqual(mistakes(P, s), [at]);
});

test("a right answer written by the player is not a mistake", () => {
  const at = blank(P);
  const s = write(P, initialState(P), at, P.solution[at]);
  assert.deepEqual(mistakes(P, s), []);
  assert.equal(nextStep(P, s).kind, "cell", "and reasoning carries on from it");
});

test("hints survive a reload, and a save cannot invent extra ones", () => {
  const s = hint(P, hint(P, initialState(P)));
  const back = initialState(P, toSave(P, s));
  assert.deepEqual(back.shown, s.shown);
  assert.equal(hintsLeft(back), HINTS - 2);

  const greedy = initialState(P, {
    entries: new Array(81).fill(0),
    shown: [...Array(20).keys()].concat([999]),
  });
  assert.ok(greedy.shown.length <= HINTS, "a save claiming twenty hints gets three");
  assert.ok(!greedy.shown.includes(999), "and a cell off the board is dropped");
});

test("a hint says which kind of reasoning it used", () => {
  // it is meant to show where the deduction was, not just advance the board
  const step = nextStep(P, initialState(P));
  if (step.kind === "cell") assert.ok(step.by === "naked" || step.by === "hidden");
});
