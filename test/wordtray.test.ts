import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  cells,
  cellsOf,
  clearPick,
  hint,
  hintTarget,
  hintsLeft,
  HINTS,
  initialState,
  isSolved,
  judge,
  lit,
  pick,
  submit,
  toSave,
  trayOrder,
  unpick,
  type Puzzle,
} from "../src/games/wordtray/engine.ts";

const archive: Puzzle[] = JSON.parse(readFileSync("src/data/wordtray.json", "utf8"));
const P = archive[0];

/* ── the archive ──────────────────────────────────────────────────────────── */

test("every grid word can be spelled from its own tray", () => {
  for (const p of archive) {
    for (const { word } of p.words) {
      const spare = [...p.letters];
      for (const ch of word) {
        const i = spare.indexOf(ch);
        assert.ok(i >= 0, `${p.id}: ${word} needs a ${ch} the tray does not have`);
        spare.splice(i, 1);
      }
    }
  }
});

test("every bonus word can be spelled too, and is not already in the grid", () => {
  for (const p of archive.slice(0, 20)) {
    const inGrid = new Set(p.words.map((w) => w.word));
    for (const word of p.bonus) {
      assert.ok(!inGrid.has(word), `${p.id}: ${word} is in the grid and the bonus list`);
      const spare = [...p.letters];
      for (const ch of word) {
        const i = spare.indexOf(ch);
        assert.ok(i >= 0, `${p.id}: bonus ${word} is not spellable`);
        spare.splice(i, 1);
      }
    }
  }
});

test("every word sits inside its grid", () => {
  for (const p of archive) {
    for (const { word, x, y, across } of p.words) {
      assert.ok(x >= 0 && y >= 0, `${p.id}: ${word} starts off the grid`);
      if (across) assert.ok(x + word.length <= p.w, `${p.id}: ${word} runs off the right`);
      else assert.ok(y + word.length <= p.h, `${p.id}: ${word} runs off the bottom`);
    }
  }
});

test("crossings agree on their shared letter", () => {
  for (const p of archive) {
    const seen = new Map<string, string>();
    for (const { word, x, y, across } of p.words) {
      for (let i = 0; i < word.length; i++) {
        const k = across ? `${x + i},${y}` : `${x},${y + i}`;
        const had = seen.get(k);
        assert.ok(!had || had === word[i], `${p.id}: ${k} is both ${had} and ${word[i]}`);
        seen.set(k, word[i]);
      }
    }
  }
});

test("every grid is connected — no word floating on its own", () => {
  for (const p of archive) {
    const owners = new Map<string, string[]>();
    for (const { word, x, y, across } of p.words)
      for (const k of cellsOf({ word, x, y, across })) {
        owners.set(k, [...(owners.get(k) ?? []), word]);
      }
    // walk the word graph from the first word through shared cells
    const linked = new Map<string, Set<string>>();
    for (const list of owners.values())
      for (const a of list)
        for (const b of list)
          if (a !== b) linked.set(a, (linked.get(a) ?? new Set()).add(b));

    const seen = new Set([p.words[0].word]);
    const queue = [p.words[0].word];
    while (queue.length) {
      const w = queue.shift()!;
      for (const next of linked.get(w) ?? []) if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
    assert.equal(seen.size, p.words.length, `${p.id}: ${p.words.length - seen.size} word(s) not joined on`);
  }
});

test("the archive numbers straight through and never repeats a tray", () => {
  const letters = new Set<string>();
  archive.forEach((p, i) => {
    assert.equal(p.id, `WT-${String(i + 1).padStart(3, "0")}`);
    const sorted = [...p.letters].sort().join("");
    assert.ok(!letters.has(sorted), `${p.id} deals the same seven letters as an earlier tray`);
    letters.add(sorted);
  });
});

/* ── playing ──────────────────────────────────────────────────────────────── */

const spell = (p: Puzzle, word: string) => {
  let s = initialState(p);
  const spare = [...p.letters];
  for (const ch of word) {
    const i = p.letters.split("").findIndex((c, n) => c === ch && spare[n] !== null && !s.picked.includes(n));
    s = pick(s, i);
    spare[i] = null as unknown as string;
  }
  return s;
};

test("a word in the grid is found", () => {
  const target = P.words[0].word;
  const { state, outcome, word } = submit(P, spell(P, target));
  assert.equal(word, target);
  assert.equal(outcome, "found");
  assert.deepEqual(state.found, [target]);
  assert.equal(state.picked.length, 0, "and the pick is cleared either way");
});

test("a real word the grid does not hold is a bonus, never wrong", () => {
  const target = P.bonus[0];
  const { state, outcome } = submit(P, spell(P, target));
  assert.equal(outcome, "bonus");
  assert.deepEqual(state.extras, [target]);
  assert.equal(state.found.length, 0, "and it does not fill anything in");
});

test("the same word twice is 'again', not a second find", () => {
  const target = P.words[0].word;
  const first = submit(P, spell(P, target)).state;
  const asked = judge(P, first, target);
  assert.equal(asked, "again");
  const second = submit(P, { ...spell(P, target), found: first.found });
  assert.deepEqual(second.state.found, [target], "counted once");
});

test("two letters is too short, and nonsense is simply not a word", () => {
  const s = initialState(P);
  assert.equal(judge(P, s, P.letters.slice(0, 2)), "no");
  assert.equal(judge(P, s, "QQQQ"), "no");
});

test("a letter cannot be used twice from one tap", () => {
  let s = initialState(P);
  s = pick(s, 0);
  const same = pick(s, 0);
  assert.equal(same, s, "identity — the tap did nothing");
  assert.equal(s.picked.length, 1);
});

test("backspace and clear do what they say", () => {
  let s = initialState(P);
  s = pick(pick(pick(s, 0), 1), 2);
  assert.equal(s.picked.length, 3);
  s = unpick(s);
  assert.equal(s.picked.length, 2);
  s = clearPick(s);
  assert.equal(s.picked.length, 0);
  assert.equal(unpick(s), s, "and neither does anything from empty");
});

test("the puzzle is solved once every grid word is in, bonus or not", () => {
  let s = initialState(P);
  assert.ok(!isSolved(P, s));
  for (const { word } of P.words) s = submit(P, { ...spell(P, word), found: s.found, extras: s.extras }).state;
  assert.ok(isSolved(P, s));
  assert.equal(s.extras.length, 0, "and no bonus was needed to get there");
});

/* ── the grid, derived ────────────────────────────────────────────────────── */

test("cells are derived from the words and every crossing lists both", () => {
  const grid = cells(P);
  const total = P.words.reduce((n, w) => n + w.word.length, 0);
  assert.ok(grid.length < total, "crossings mean fewer cells than letters");
  assert.ok(grid.some((c) => c.words.length === 2), "and at least one cell belongs to two words");
  for (const c of grid) assert.ok(c.x < P.w && c.y < P.h, "and all of them are on the grid");
});

/* ── the tray ─────────────────────────────────────────────────────────────── */

test("the tray is shuffled, so the seven-letter answer is not sitting in plain sight", () => {
  const scrambled = archive.filter((p) => {
    const order = trayOrder(p);
    return order.some((n, i) => n !== i);
  });
  assert.ok(scrambled.length > archive.length * 0.9, "nearly all of them move");
});

test("the shuffle is stable, so the tray does not rearrange itself as you look at it", () => {
  assert.deepEqual(trayOrder(P), trayOrder(P));
  assert.notDeepEqual(trayOrder(P), trayOrder(archive[1]));
});

test("a shuffled tray still holds exactly the seven letters", () => {
  for (const p of archive.slice(0, 20)) {
    const order = trayOrder(p);
    assert.deepEqual(
      order.map((i) => p.letters[i]).sort(),
      [...p.letters].sort(),
      `${p.id}: the shuffle lost or duplicated a letter`
    );
  }
});

/* ── saving ───────────────────────────────────────────────────────────────── */

test("a save carries the finds and drops anything the tray no longer holds", () => {
  const target = P.words[0].word;
  const s = submit(P, spell(P, target)).state;
  const saved = toSave(s);
  assert.deepEqual(saved.found, [target]);

  const back = initialState(P, { found: [target, "NOTAWORDHERE"], extras: ["ALSONOT"] });
  assert.deepEqual(back.found, [target], "junk from an older archive is discarded");
  assert.deepEqual(back.extras, []);
});

/* ── hints ────────────────────────────────────────────────────────────────── */

test("a hint gives one letter, and only three of them", () => {
  let s = initialState(P);
  assert.equal(hintsLeft(s), HINTS);
  for (let i = 1; i <= HINTS; i++) {
    s = hint(P, s);
    assert.equal(s.shown.length, i);
    assert.equal(hintsLeft(s), HINTS - i);
  }
  const spent = hint(P, s);
  assert.equal(spent, s, "the fourth ask changes nothing at all");
  assert.equal(hintTarget(P, s), null, "and the button has nothing to offer");
});

test("a hinted cell is a real, still-blank square of the grid", () => {
  const real = new Set(cells(P).map((c) => `${c.x},${c.y}`));
  let s = initialState(P);
  for (let i = 0; i < HINTS; i++) {
    const k = hintTarget(P, s)!;
    assert.ok(real.has(k), `${k} is not part of any word`);
    assert.ok(!s.shown.includes(k), "and not one already given");
    s = hint(P, s);
  }
});

test("no word is given two of its letters", () => {
  // spending every hint on one word would be the worst of both — no help
  // anywhere else, and one word simply handed over. A cell belongs to two words
  // where they cross, so this has to hold for the crossing word too: the first
  // version of the rule looked at words rather than cells and failed here.
  for (const p of archive.slice(0, 30)) {
    let s = initialState(p);
    for (let i = 0; i < HINTS; i++) s = hint(p, s);
    for (const w of p.words) {
      const n = cellsOf(w).filter((k) => s.shown.includes(k)).length;
      assert.ok(n <= 1, `${p.id}: ${w.word} was handed ${n} of its letters`);
    }
  }
});

test("the first hint goes to one of the shortest words", () => {
  const shortest = Math.min(...P.words.map((p) => p.word.length));
  const k = hintTarget(P, initialState(P))!;
  const through = P.words.filter((p) => cellsOf(p).includes(k));
  assert.ok(
    through.some((p) => p.word.length === shortest),
    `${k} is only in ${through.map((p) => p.word).join(", ")}`
  );
});

test("a hint never points at a letter a crossing word already showed", () => {
  const first = P.words[0];
  let s = submit(P, spell(P, first.word)).state;
  const on = lit(P, s);
  assert.ok(on.size > 0);
  for (let i = 0; i < HINTS; i++) {
    const k = hintTarget(P, s);
    if (!k) break;
    assert.ok(!on.has(k), `${k} is already filled in`);
    s = hint(P, s);
  }
});

test("a solved grid has nothing left to hint at", () => {
  let s = initialState(P);
  for (const { word } of P.words) s = submit(P, { ...spell(P, word), found: s.found }).state;
  assert.ok(isSolved(P, s));
  assert.equal(hintTarget(P, s), null);
});

test("hints survive a reload, and a save cannot invent extra ones", () => {
  const s = hint(P, hint(P, initialState(P)));
  const back = initialState(P, toSave(s));
  assert.deepEqual(back.shown, s.shown, "the same two letters come back");
  assert.equal(hintsLeft(back), HINTS - 2, "and they are still spent");

  const greedy = initialState(P, {
    found: [],
    extras: [],
    shown: [...cells(P).slice(0, 9).map((c) => `${c.x},${c.y}`), "99,99"],
  });
  assert.equal(greedy.shown.length, HINTS, "a save claiming nine hints gets three");
  assert.ok(!greedy.shown.includes("99,99"), "and a cell off the grid is dropped");
});
