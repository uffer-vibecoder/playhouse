import { test } from "node:test";
import assert from "node:assert/strict";
import {
  score,
  submit,
  typeLetter,
  backspace,
  initialState,
  keyboardMarks,
  shareGrid,
  answerOf,
  TRIES,
  type Puzzle,
  type State,
} from "../src/games/wordgame/engine.ts";

const puzzleFor = (word: string): Puzzle => ({
  id: "WG-TEST",
  answer: btoa(word),
});

/** Compact reading of a mark array: g = hit, y = near, . = miss. */
const shape = (marks: ReturnType<typeof score>) =>
  marks.map((m) => (m === "hit" ? "g" : m === "near" ? "y" : ".")).join("");

const anyWord = () => true;
const play = (p: Puzzle, s: State, word: string, isWord = anyWord) =>
  submit(p, { ...s, current: word }, isWord);

/* ── scoring ─────────────────────────────────────────────────────────────── */

test("an exact guess is all hits", () => {
  assert.equal(shape(score("STONE", "STONE")), "ggggg");
});

test("a guess sharing nothing is all misses", () => {
  assert.equal(shape(score("STONE", "chirp".toUpperCase())), ".....");
});

test("repeated letters: a third B goes grey once the answer's two are spent", () => {
  // ABBEY has two B's. BOBBY guesses three: one lands exactly, so exactly one
  // of the others may go yellow and the last must go grey. This is the case a
  // single-pass scorer gets wrong.
  assert.equal(shape(score("ABBEY", "BOBBY")), "y.g.g");
});

test("repeated letters: both E's count when the answer really has two", () => {
  // The mirror of the case above — SPEED has two E's and neither is matched
  // exactly, so ERASE is entitled to mark both of its E's.
  assert.equal(shape(score("SPEED", "ERASE")), "y..yy");
});

test("repeated letters: a fourth E is not owed anything", () => {
  // Three E's guessed against an answer holding two.
  assert.equal(shape(score("SPEED", "EERIE")), "yy...");
});

test("an exact match is claimed before any near match of the same letter", () => {
  // ROBIN holds exactly one N, and the guess spends it at the last position.
  // Marking left to right in one pass would colour the leading N yellow and
  // still colour the final N green — crediting one N twice.
  assert.equal(shape(score("ROBIN", "NOBIN")), ".gggg");
});

test("exact matches exhaust the tally too", () => {
  // SPASM has two S's; SWISS guesses three. Two land exactly, so the third has
  // nothing left to claim.
  assert.equal(shape(score("SPASM", "SWISS")), "g..g.");
});

/* ── entry ───────────────────────────────────────────────────────────────── */

test("typing stops at the word length and ignores non-letters", () => {
  const p = puzzleFor("STONE");
  let s = initialState(p);
  for (const ch of "STONES") s = typeLetter(s, ch);
  assert.equal(s.current, "STONE");
  assert.equal(typeLetter(s, "4").current, "STONE");
});

test("backspace removes one letter and never underflows", () => {
  const p = puzzleFor("STONE");
  let s = typeLetter(initialState(p), "S");
  s = backspace(s);
  assert.equal(s.current, "");
  assert.equal(backspace(s).current, "");
});

/* ── submitting ──────────────────────────────────────────────────────────── */

test("a short guess is refused and costs no turn", () => {
  const p = puzzleFor("STONE");
  const s = play(p, initialState(p), "STO");
  assert.equal(s.guesses.length, 0);
  assert.match(s.notice!, /5 letters/);
});

test("a word outside the vocabulary is refused and costs no turn", () => {
  const p = puzzleFor("STONE");
  const s = play(p, initialState(p), "ZZZZZ", () => false);
  assert.equal(s.guesses.length, 0);
  assert.match(s.notice!, /Not a word/);
});

test("guessing the answer wins", () => {
  const p = puzzleFor("STONE");
  const s = play(p, initialState(p), "STONE");
  assert.equal(s.status, "won");
  assert.equal(s.guesses.length, 1);
});

test("running out of turns loses, and the board then refuses input", () => {
  const p = puzzleFor("STONE");
  let s = initialState(p);
  for (let i = 0; i < TRIES; i++) s = play(p, s, "CHIRP");
  assert.equal(s.status, "lost");
  assert.equal(s.guesses.length, TRIES);
  assert.equal(play(p, s, "STONE").guesses.length, TRIES, "no play after the end");
  assert.equal(typeLetter(s, "A").current, "", "no typing after the end");
});

/* ── restoring ───────────────────────────────────────────────────────────── */

test("a restored game resumes mid-play", () => {
  const p = puzzleFor("STONE");
  const s = initialState(p, { guesses: ["CHIRP", "SLATE"] });
  assert.equal(s.guesses.length, 2);
  assert.equal(s.status, "playing");
});

test("a restored game that was already won stays won", () => {
  const p = puzzleFor("STONE");
  assert.equal(initialState(p, { guesses: ["CHIRP", "STONE"] }).status, "won");
});

test("restoring discards junk rather than trusting the store", () => {
  const p = puzzleFor("STONE");
  const s = initialState(p, {
    guesses: ["CHIRP", "TOO", "with space", "SLATE", "44444"],
  });
  assert.deepEqual(s.guesses, ["CHIRP", "SLATE"]);
});

/* ── keyboard and sharing ────────────────────────────────────────────────── */

test("a letter's keyboard colour is its best result, never downgraded", () => {
  const p = puzzleFor("STONE");
  let s = initialState(p);
  s = play(p, s, "STONE"); // S lands exactly
  const marks = keyboardMarks(p, { ...s, guesses: [...s.guesses, "SPEND"] });
  assert.equal(marks.S, "hit", "a later wrong-place S must not demote the hit");
});

test("the share grid carries no letters of the answer", () => {
  const p = puzzleFor("STONE");
  const s = play(p, initialState(p), "STONE");
  const grid = shareGrid(p, s, "Playhouse");
  assert.ok(!/STONE/.test(grid));
  assert.match(grid, /1\/6/);
  assert.match(grid, /🟩{5}/u);
});

test("a lost game shares as X", () => {
  const p = puzzleFor("STONE");
  let s = initialState(p);
  for (let i = 0; i < TRIES; i++) s = play(p, s, "CHIRP");
  assert.match(shareGrid(p, s, "Playhouse"), /X\/6/);
});

/* ── the archive itself ──────────────────────────────────────────────────── */

test("every archived answer decodes to five letters and is a legal guess", async () => {
  const [{ default: archive }, { default: guesses }] = await Promise.all([
    import("../src/data/wordgame.json", { with: { type: "json" } }),
    import("../src/data/wordgame-guesses.json", { with: { type: "json" } }),
  ]);
  const legal = new Set(guesses as string[]);
  const seen = new Set<string>();

  for (const p of archive as Puzzle[]) {
    const word = answerOf(p);
    assert.match(word, /^[A-Z]{5}$/, `${p.id} is not five letters`);
    assert.ok(legal.has(word), `${p.id} (${word}) would be rejected as a guess`);
    assert.ok(!seen.has(word), `${word} appears twice`);
    seen.add(word);
  }
  assert.ok(seen.size > 0);
});
