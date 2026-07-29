import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import * as J from "../src/games/jigsaw/engine.ts";
import * as W from "../src/games/wordtray/engine.ts";
import * as B from "../src/games/blocks/engine.ts";

/**
 * Random play against the engines, checking the things that must never stop
 * being true.
 *
 * Hand-written tests check the cases someone thought of. These play thousands
 * of moves nobody thought of and assert the invariants instead — which is the
 * only way to catch the state a real player reaches by accident on a Tuesday.
 * Seeded, so a failure is reproducible rather than a story.
 */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(r: () => number, xs: T[]): T => xs[Math.floor(r() * xs.length)];

/* ── jigsaw sudoku ────────────────────────────────────────────────────────── */

const jigsaw: J.Puzzle[] = JSON.parse(readFileSync("src/data/jigsaw.json", "utf8"));

test("jigsaw survives ten thousand random moves", () => {
  const CELLS = 81;
  for (let seed = 0; seed < 20; seed++) {
    const r = rng(1000 + seed);
    const p = pick(r, jigsaw);
    let s = J.initialState(p);

    for (let move = 0; move < 500; move++) {
      const cell = Math.floor(r() * CELLS);
      const value = 1 + Math.floor(r() * 9);
      const what = r();
      if (what < 0.4) s = J.write(p, s, cell, value);
      else if (what < 0.6) s = J.toggle(p, s, cell, value);
      else if (what < 0.75) s = J.note(p, s, cell, value);
      else if (what < 0.9) s = J.erase(p, s, cell);
      else s = J.hint(p, s);

      /* a clue is the board's and can never be written over, whatever is done */
      for (let c = 0; c < CELLS; c++) {
        if (p.given[c]) assert.equal(s.entries[c], p.given[c], `${p.id}: clue at ${c} moved`);
      }
      /* notes only ever sit in an empty square that is not a clue */
      for (let c = 0; c < CELLS; c++) {
        if (s.marks[c]) {
          assert.equal(s.entries[c], 0, `${p.id}: notes under a number at ${c}`);
          assert.ok(!p.given[c], `${p.id}: notes on a clue at ${c}`);
        }
      }
      /* hints are capped, and a hint is never wrong */
      assert.ok(s.shown.length <= J.HINTS, `${p.id}: ${s.shown.length} hints spent`);
      for (const c of s.shown) {
        assert.equal(s.entries[c], p.solution[c], `${p.id}: a hint wrote the wrong number at ${c}`);
      }
      /* finished means finished */
      if (J.isSolved(p, s)) {
        assert.equal(J.conflicts(p, s).size, 0, `${p.id}: solved but clashing`);
        assert.deepEqual(J.mistakes(p, s), []);
      }
    }

    /* whatever state it reached, a save carries it back exactly */
    const back = J.initialState(p, J.toSave(p, s));
    assert.deepEqual(back.entries, s.entries, `${p.id}: entries lost in the save`);
    assert.deepEqual(back.marks, s.marks, `${p.id}: notes lost in the save`);
    assert.deepEqual(back.shown, s.shown, `${p.id}: hints lost in the save`);
  }
});

test("a jigsaw hint is never wrong, however messy the board", () => {
  for (let seed = 0; seed < 30; seed++) {
    const r = rng(7000 + seed);
    const p = pick(r, jigsaw);
    let s = J.initialState(p);

    // fill some squares correctly, so the hint has real work to reason from
    const blanks = [...Array(81).keys()].filter((c) => !p.given[c]);
    for (const c of blanks) if (r() < 0.3) s = J.write(p, s, c, p.solution[c]);

    const step = J.nextStep(p, s);
    if (step.kind === "cell") {
      assert.equal(step.value, p.solution[step.cell], `${p.id}: hint contradicts the answer`);
      assert.equal(s.entries[step.cell], 0, `${p.id}: hint points at a filled square`);
    }

    // now put one wrong number in and it must refuse rather than reason on
    const empty = blanks.find((c) => !s.entries[c]);
    if (empty === undefined) continue;
    const wrong = p.solution[empty] === 9 ? 1 : 9;
    const dirty = J.write(p, s, empty, wrong);
    const refused = J.nextStep(p, dirty);
    assert.equal(refused.kind, "mistake", `${p.id}: reasoned from a wrong number`);
    assert.equal(J.hint(p, dirty), dirty, `${p.id}: a refusal cost a hint`);
  }
});

/* ── word tray ────────────────────────────────────────────────────────────── */

const trays: W.Puzzle[] = JSON.parse(readFileSync("src/data/wordtray.json", "utf8"));

test("word tray survives random tapping", () => {
  for (let seed = 0; seed < 20; seed++) {
    const r = rng(2000 + seed);
    const p = pick(r, trays);
    let s = W.initialState(p);
    const inGrid = new Set(p.words.map((w) => w.word));
    const spare = new Set(p.bonus);

    for (let move = 0; move < 400; move++) {
      const what = r();
      if (what < 0.5) s = W.pick(s, Math.floor(r() * p.letters.length));
      else if (what < 0.65) s = W.submit(p, s).state;
      else if (what < 0.75) s = W.unpick(s);
      else if (what < 0.85) s = W.clearPick(s);
      else if (what < 0.95) s = W.shuffle(s);
      else s = W.hint(p, s);

      /* the same letter can never be used twice from one tap */
      assert.equal(new Set(s.picked).size, s.picked.length, `${p.id}: a letter picked twice`);
      for (const i of s.picked) {
        assert.ok(i >= 0 && i < p.letters.length, `${p.id}: picked a letter that is not there`);
      }
      /* nothing is ever found that the tray does not hold */
      for (const w of s.found) assert.ok(inGrid.has(w), `${p.id}: found ${w}, which is not in the grid`);
      for (const w of s.extras) assert.ok(spare.has(w), `${p.id}: ${w} counted as a bonus`);
      assert.equal(new Set(s.found).size, s.found.length, `${p.id}: a word found twice`);
      assert.equal(new Set(s.extras).size, s.extras.length, `${p.id}: a bonus counted twice`);
      assert.ok(W.hintsLeft(s) >= 0, `${p.id}: more hints than there are`);
    }

    const back = W.initialState(p, W.toSave(s));
    assert.deepEqual(back.found, s.found, `${p.id}: finds lost in the save`);
    assert.deepEqual(back.extras, s.extras, `${p.id}: bonuses lost in the save`);
    assert.deepEqual(back.shown, s.shown, `${p.id}: hints lost in the save`);
  }
});

/* ── colour blocks ────────────────────────────────────────────────────────── */

const boards: B.Puzzle[] = JSON.parse(readFileSync("src/data/blocks.json", "utf8"));

test("blocks never overlap or leave the board, however they are shoved", () => {
  for (let seed = 0; seed < 25; seed++) {
    const r = rng(3000 + seed);
    const p = pick(r, boards);
    let s = B.initialState(p);
    const history = [s];

    for (let move = 0; move < 200; move++) {
      if (r() < 0.15) {
        s = B.undo(s);
      } else {
        const i = Math.floor(r() * s.blocks.length);
        const dir = pick(r, ["up", "down", "left", "right"] as const);
        s = B.slide(p, s, i, dir);
      }
      history.push(s);

      /* every block is on the board */
      for (const b of s.blocks) {
        assert.ok(b.x >= 0 && b.y >= 0, `${p.id}: a block left the board at ${b.x},${b.y}`);
        assert.ok(b.x + b.w <= p.w && b.y + b.h <= p.h, `${p.id}: a block hangs off the edge`);
      }
      /* and no two are in the same place */
      const filled = new Set<string>();
      for (const b of s.blocks) {
        for (let y = b.y; y < b.y + b.h; y++) {
          for (let x = b.x; x < b.x + b.w; x++) {
            const k = `${x},${y}`;
            assert.ok(!filled.has(k), `${p.id}: two blocks on ${k}`);
            filled.add(k);
          }
        }
      }
      /* the hero leaves once and stays gone until undone */
      const heroes = s.blocks.filter((b) => b.hero).length;
      assert.ok(heroes <= 1, `${p.id}: ${heroes} blocks trying to escape`);
      if (B.isSolved(s)) assert.equal(heroes, 0, `${p.id}: solved with the hero still here`);
    }
  }
});

test("undo walks all the way back to the start", () => {
  for (let seed = 0; seed < 15; seed++) {
    const r = rng(4000 + seed);
    const p = pick(r, boards);
    const start = B.initialState(p);
    let s = start;
    for (let move = 0; move < 40; move++) {
      s = B.slide(p, s, Math.floor(r() * s.blocks.length), pick(r, ["up", "down", "left", "right"] as const));
    }
    for (let i = 0; i < 200 && s.moves > 0; i++) s = B.undo(s);
    assert.equal(s.moves, 0, `${p.id}: could not get back to the start`);
    assert.deepEqual(
      [...s.blocks].sort((a, b) => a.id - b.id),
      [...start.blocks].sort((a, b) => a.id - b.id),
      `${p.id}: undo did not restore the board`
    );
  }
});
