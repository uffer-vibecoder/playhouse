import { test } from "node:test";
import assert from "node:assert/strict";
import { fingerprint, gameOf, isFrom, puzzleOf, slotKey } from "../src/lib/slot.ts";

/* ── the grammar ──────────────────────────────────────────────────────────── */

test("a slot is game, puzzle and fingerprint, and reads back the same way", () => {
  const fp = fingerprint([[1, 2, 3]], "key");
  const slot = slotKey("codeword", "CW-001", fp);
  assert.equal(slot, `codeword:CW-001:${fp}`);
  assert.equal(gameOf(slot), "codeword");
  assert.equal(puzzleOf(slot), "CW-001");
});

test("the game is read from the slot, whatever anyone else says it is", () => {
  // the bug this file exists for: mergeLocalIntoCloud uploaded every local save
  // and stamped them all with whichever game was open at sign-in, so a codeword
  // arrived in the cloud labelled wordtray and vanished from codeword's picker
  const slot = slotKey("codeword", "CW-014", "abc123");
  assert.equal(gameOf(slot), "codeword");
  assert.ok(isFrom(slot, "codeword"));
  assert.ok(!isFrom(slot, "wordtray"), "and no amount of mislabelling changes that");
});

test("a run's slot still names its game, though its puzzle carries the round", () => {
  // Free-Atro writes FA-001-r3, which is why looking it up by deal id never
  // matched and its progress was structurally stuck at zero
  const slot = slotKey("freeatro", "FA-001-r3", "xyz");
  assert.equal(gameOf(slot), "freeatro");
  assert.equal(puzzleOf(slot), "FA-001-r3");
  assert.notEqual(puzzleOf(slot), "FA-001", "the round is part of the id, not decoration");
});

test("nonsense in gives an empty game rather than a wrong one", () => {
  assert.equal(gameOf(""), "");
  assert.equal(puzzleOf("wordtray"), "", "no colon, so there is no puzzle to name");
  assert.ok(!isFrom("", "codeword"));
});

test("a prefix match is not a game match", () => {
  // "word" must not pick up "wordtray" or "wordgame"
  assert.ok(!isFrom(slotKey("wordtray", "WT-001", "a"), "word"));
  assert.ok(!isFrom(slotKey("wordgame", "WG-001", "a"), "wordtray"));
});

/* ── the fingerprint ──────────────────────────────────────────────────────── */

test("the same puzzle fingerprints the same, a different one does not", () => {
  assert.equal(fingerprint([[1, 2]], "k"), fingerprint([[1, 2]], "k"));
  assert.notEqual(fingerprint([[1, 2]], "k"), fingerprint([[1, 3]], "k"));
  assert.notEqual(fingerprint([[1, 2]], "k"), fingerprint([[1, 2]], "j"));
});

test("changing a puzzle's shape retires its old saves", () => {
  // Word Tray's grids were re-cut from 8 to 12 words; the fingerprint covers
  // the grid size, so a save from the old cut cannot load onto the new board
  const before = slotKey("wordtray", "WT-001", fingerprint([[8, 6]], "ABOLISH"));
  const after = slotKey("wordtray", "WT-001", fingerprint([[11, 10]], "ABOLISH"));
  assert.notEqual(before, after);
  assert.equal(gameOf(before), gameOf(after), "same game, same puzzle number, different board");
});

test("a fingerprint is short and url-safe", () => {
  const fp = fingerprint([[1, 2, 3, 4, 5]], "a longer key with spaces");
  assert.match(fp, /^[0-9a-z]{1,7}$/, fp);
});
