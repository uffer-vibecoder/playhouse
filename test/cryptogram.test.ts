import { test } from "node:test";
import assert from "node:assert/strict";
import {
  check,
  codesUsed,
  clear,
  erase,
  focusCode,
  freeEntries,
  initialState,
  isSolvedPuzzle,
  letterFor,
  lettersUsed,
  place,
  plainOf,
  progress,
  reveal,
  step,
  wordsOf,
  type Assignment,
  type Puzzle,
  type State,
} from "../src/games/cryptogram/engine.ts";

/** A tiny fixture: shift every letter by one, so no letter maps to itself. */
const KEY = "ZABCDEFGHIJKLMNOPQRSTUVWXY"; // key[0]='Z' means code 1 stands for Z
const make = (plain: string, given: number[] = []): Puzzle => ({
  id: "CG-TEST",
  text: btoa(plain),
  key: KEY,
  given,
});

const codeOf = (letter: string) => KEY.indexOf(letter) + 1;

/** Fill in the whole solution, one code at a time. */
const solveAll = (p: Puzzle, s: State): State => {
  let next = s;
  for (const c of codesUsed(p)) {
    if (next.locked.has(c)) continue;
    next = place(focusCode(next, c), letterFor(p, c));
  }
  return next;
};

/* ── reading the puzzle ──────────────────────────────────────────────────── */

test("the plaintext round-trips out of the payload", () => {
  assert.equal(plainOf(make("HELLO THERE.")), "HELLO THERE.");
});

test("words split on spaces and keep their punctuation", () => {
  const words = wordsOf(make("BIG CAT, YES."));
  assert.equal(words.length, 3);
  assert.deepEqual(words[1].map((t) => t.ch), ["C", "A", "T", ","]);
  assert.equal(words[1][3].code, null, "a comma carries no code");
  assert.equal(words[1][0].code, codeOf("C"));
});

test("the same letter always carries the same code", () => {
  const words = wordsOf(make("SEES."));
  const codes = words[0].filter((t) => t.code).map((t) => t.code);
  assert.equal(codes[0], codes[3], "both S must share a code");
  assert.equal(codes[1], codes[2], "both E must share a code");
  assert.notEqual(codes[0], codes[1]);
});

test("codesUsed lists each code once, in first appearance order", () => {
  const p = make("SEES.");
  assert.deepEqual(codesUsed(p), [codeOf("S"), codeOf("E")]);
});

/* ── starters ────────────────────────────────────────────────────────────── */

test("starters arrive filled in and locked", () => {
  const p = make("BIG CAT.", [codeOf("B")]);
  const s = initialState(p);
  assert.equal(s.assign[codeOf("B")], "B");
  assert.ok(s.locked.has(codeOf("B")));
});

test("a starter cannot be typed over or erased", () => {
  const p = make("BIG CAT.", [codeOf("B")]);
  const s = focusCode(initialState(p), codeOf("B"));
  assert.equal(place(s, "Q").assign[codeOf("B")], "B");
  assert.equal(erase(s).assign[codeOf("B")], "B");
});

/* ── entry ───────────────────────────────────────────────────────────────── */

test("a letter fills every copy of its code at once", () => {
  const p = make("SEES.");
  const s = place(focusCode(initialState(p), codeOf("S")), "S");
  // one assignment covers both S positions, because position is not the unit
  assert.equal(s.assign[codeOf("S")], "S");
  assert.equal(Object.keys(s.assign).length, 1);
});

test("reusing a letter takes it away from where it was", () => {
  const p = make("BIG CAT.");
  let s = place(focusCode(initialState(p), codeOf("B")), "X");
  s = place(focusCode(s, codeOf("C")), "X");
  assert.equal(s.assign[codeOf("C")], "X");
  assert.equal(s.assign[codeOf("B")], undefined, "the earlier guess must be released");
  assert.equal(lettersUsed(s).size, 1);
});

test("erase clears only the focused code", () => {
  const p = make("BIG CAT.");
  let s = place(focusCode(initialState(p), codeOf("B")), "B");
  s = place(focusCode(s, codeOf("I")), "I");
  s = erase(focusCode(s, codeOf("I")));
  assert.equal(s.assign[codeOf("I")], undefined);
  assert.equal(s.assign[codeOf("B")], "B");
});

test("stepping skips codes that are already locked", () => {
  const p = make("BIG CAT.", [codeOf("B")]);
  const s = step(p, initialState(p), 1);
  assert.ok(!s.locked.has(s.cursor!), "the cursor must not land on a starter");
});

/* ── tools ───────────────────────────────────────────────────────────────── */

test("check marks filled-but-wrong codes and leaves blanks alone", () => {
  const p = make("BIG CAT.");
  let s = place(focusCode(initialState(p), codeOf("B")), "B"); // right
  s = place(focusCode(s, codeOf("I")), "Q"); // wrong
  s = check(p, s);
  assert.ok(!s.wrong.has(codeOf("B")));
  assert.ok(s.wrong.has(codeOf("I")));
  assert.ok(!s.wrong.has(codeOf("G")), "an untouched code is not a mistake");
});

test("reveal fills the focused code correctly and locks it", () => {
  const p = make("BIG CAT.");
  const s = reveal(p, focusCode(initialState(p), codeOf("G")));
  assert.equal(s.assign[codeOf("G")], "G");
  assert.ok(s.locked.has(codeOf("G")));
});

test("reveal takes its letter back from a wrong guess elsewhere", () => {
  const p = make("BIG CAT.");
  let s = place(focusCode(initialState(p), codeOf("B")), "G"); // G guessed in the wrong place
  s = reveal(p, focusCode(s, codeOf("G")));
  assert.equal(s.assign[codeOf("G")], "G");
  assert.equal(s.assign[codeOf("B")], undefined, "the stale G must be released");
});

test("clear returns to the starters and nothing else", () => {
  const p = make("BIG CAT.", [codeOf("B")]);
  let s = place(focusCode(initialState(p), codeOf("I")), "I");
  s = clear(p);
  assert.equal(s.assign[codeOf("B")], "B");
  assert.equal(s.assign[codeOf("I")], undefined);
});

/* ── solving, saving, restoring ──────────────────────────────────────────── */

test("assigning every code correctly solves it", () => {
  const p = make("BIG CAT, YES.");
  const s = solveAll(p, initialState(p));
  assert.ok(isSolvedPuzzle(p, s));
  const { done, total } = progress(p, s);
  assert.equal(done, total);
});

test("one wrong code is not a solve", () => {
  const p = make("BIG CAT.");
  let s = solveAll(p, initialState(p));
  s = place(focusCode(s, codeOf("G")), "Q");
  assert.ok(!isSolvedPuzzle(p, s));
});

test("only the player's own entries are persisted", () => {
  const p = make("BIG CAT.", [codeOf("B")]);
  const s = place(focusCode(initialState(p), codeOf("I")), "I");
  const saved = freeEntries(s);
  assert.equal(saved[codeOf("I")], "I");
  assert.equal(saved[codeOf("B")], undefined, "a starter is recoverable from the puzzle");
});

test("restoring drops entries that break the rules", () => {
  const p = make("BIG CAT.", [codeOf("B")]);
  const restored: Assignment = {
    [codeOf("B")]: "Z", // collides with a starter
    [codeOf("I")]: "I", // fine
    [codeOf("G")]: "I", // duplicate letter
    [codeOf("C")]: "4" as string, // not a letter
  };
  const s = initialState(p, restored);
  assert.equal(s.assign[codeOf("B")], "B", "the starter must win");
  assert.equal(s.assign[codeOf("C")], undefined, "a non-letter must be dropped");

  // Exactly one of the two codes claiming "I" may keep it. Which one is not
  // worth asserting: object keys that look like integers are ordered
  // numerically rather than by insertion, so "first wins" is decided by the
  // code numbers. The invariant that matters is that no letter is used twice.
  const holdingI = [codeOf("I"), codeOf("G")].filter((c) => s.assign[c] === "I");
  assert.equal(holdingI.length, 1, "a duplicate letter must be dropped");
  const letters = Object.values(s.assign);
  assert.equal(new Set(letters).size, letters.length, "no letter may be used twice");
});

/* ── the shipped archive ─────────────────────────────────────────────────── */

test("every archived puzzle has a sound cipher and reachable starters", async () => {
  const { default: archive } = await import("../src/data/cryptogram.json", {
    with: { type: "json" },
  });

  for (const p of archive as Puzzle[]) {
    assert.equal(new Set(p.key).size, 26, `${p.id}: key is not a permutation`);

    // a derangement: no letter may stand for itself
    for (let c = 1; c <= 26; c++) {
      assert.notEqual(p.key[c - 1], String.fromCharCode(64 + c), `${p.id}: a letter encodes itself`);
    }

    const plain = plainOf(p);
    // apostrophes are allowed and carry no code, so contractions reach the
    // solver as bare letters — see ALLOWED_EXTRA in the build script
    assert.match(plain, /^[A-Z ,'!?]+[.!?]$/, `${p.id}: unexpected characters`);

    const used = codesUsed(p);
    assert.ok(used.length >= 9, `${p.id}: only ${used.length} distinct letters`);
    for (const g of p.given) {
      assert.ok(used.includes(g), `${p.id}: starter ${g} is not in the sentence`);
    }
    assert.ok(p.given.length >= 1 && p.given.length <= 6, `${p.id}: ${p.given.length} starters`);

    // and it is actually solvable by filling in the key
    assert.ok(isSolvedPuzzle(p, solveAll(p, initialState(p))), `${p.id}: cannot be solved`);
  }
  assert.ok((archive as Puzzle[]).length > 0);
});
