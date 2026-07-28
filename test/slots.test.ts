import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  blocksSlot,
  blockoutSlot,
  codewordSlot,
  cryptogramSlot,
  freeatroSlot,
  jigsawSlot,
  slideSlot,
  solveforxSlot,
  wordgameSlot,
  wordtraySlot,
} from "../src/lib/slots.ts";
import { gameOf } from "../src/lib/slot.ts";

const load = (f: string) => JSON.parse(readFileSync(`src/data/${f}.json`, "utf8"));

/* Every archive, and the one rule that builds its slots. Before this file the
   rule was written out separately in the board, the picker, the contents page
   and the record — four copies, and Free-Atro's had already drifted. */
const ARCHIVES = [
  { game: "codeword", rows: load("codeword"), slotOf: codewordSlot },
  { game: "wordgame", rows: load("wordgame"), slotOf: wordgameSlot },
  { game: "solveforx", rows: load("solveforx"), slotOf: solveforxSlot },
  { game: "slide", rows: load("slide"), slotOf: slideSlot },
  { game: "cryptogram", rows: load("cryptogram"), slotOf: cryptogramSlot },
  { game: "blocks", rows: load("blocks"), slotOf: blocksSlot },
  { game: "wordtray", rows: load("wordtray"), slotOf: wordtraySlot },
  { game: "jigsaw", rows: load("jigsaw"), slotOf: jigsawSlot },
] as { game: string; rows: { id: string }[]; slotOf: (p: never) => string }[];

test("every archive's slots name the game they came from", () => {
  for (const { game, rows, slotOf } of ARCHIVES) {
    assert.ok(rows.length > 0, `${game} archive is empty`);
    for (const p of rows) {
      assert.equal(gameOf(slotOf(p as never)), game, `${game} ${p.id}`);
    }
  }
});

test("no two puzzles in an archive share a slot", () => {
  // a collision means two puzzles quietly share one save: finish either and
  // both show a tick, and opening the second restores the first one's work
  for (const { game, rows, slotOf } of ARCHIVES) {
    const seen = new Map<string, string>();
    for (const p of rows) {
      const slot = slotOf(p as never);
      const already = seen.get(slot);
      assert.equal(already, undefined, `${game}: ${p.id} and ${already} share ${slot}`);
      seen.set(slot, p.id);
    }
  }
});

test("a slot is stable — the same puzzle gives the same answer every time", () => {
  // it is a storage key, so an unstable one silently abandons saved work
  for (const { rows, slotOf } of ARCHIVES) {
    for (const p of rows.slice(0, 5)) {
      assert.equal(slotOf(p as never), slotOf(p as never));
    }
  }
});

test("each puzzle id appears once, so the slot is the only thing telling them apart", () => {
  for (const { game, rows } of ARCHIVES) {
    const ids = new Set(rows.map((p) => p.id));
    assert.equal(ids.size, rows.length, `${game} has a repeated id`);
  }
});

/* ── the runs ─────────────────────────────────────────────────────────────── */

test("a run's slot changes with the round, which is why a deal id never matched it", () => {
  const deal = { id: "FA-001", seed: 42 };
  const r1 = freeatroSlot(deal, 1);
  const r3 = freeatroSlot(deal, 3);
  assert.notEqual(r1, r3, "each round is its own board");
  assert.equal(gameOf(r1), "freeatro");
  // the contents page used to look up slotKey("freeatro", "FA-001", ...) and
  // could never find it, so the count sat at zero forever
  assert.ok(!r1.includes(":FA-001:"), "the id carries the round, not just the deal");
});

test("block out's runs are told apart by run number, not by seed alone", () => {
  assert.notEqual(blockoutSlot(7, 1), blockoutSlot(7, 2));
  assert.equal(gameOf(blockoutSlot(7, 1)), "blockout");
});
