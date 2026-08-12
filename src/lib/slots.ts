/**
 * One slot rule per game, defined once.
 *
 * A slot has to be built identically by four different places — the board that
 * saves it, the picker that ticks it off, the contents page that counts it, and
 * the record that reports it. It used to be written out separately in all four,
 * and that is not a style problem, it is a bug waiting its turn:
 *
 *   - Free-Atro's board keyed on the round it reached (`FA-001-r3`) while the
 *     contents page looked for the deal id. They could never match, so its
 *     progress was structurally stuck at zero and its stamp was unearnable.
 *     Nobody noticed, because a counter that never moves looks like a counter
 *     you have not earned yet.
 *   - Word Guessing's fingerprint covers its five letters and six tries. Two of
 *     the four copies wrote `[[5, 6]]` by hand. Change either constant and the
 *     board keeps saving happily while the contents page quietly stops finding
 *     anything.
 *
 * So the rule lives here and everywhere imports it. The shapes are declared
 * structurally rather than by importing ten engines: this module is loaded by
 * the landing page, and it should not drag every game's code along with it.
 */

import { fingerprint, slotKey } from "./slot.ts";

/* Word Guessing's board is five letters and six tries; the fingerprint covers
   both, so the numbers come from the engine rather than being typed again. */
import { LENGTH, TRIES } from "../games/wordgame/engine.ts";

type Seeded = { id: string; seed: number };

export const codewordSlot = (p: { id: string; grid: number[][]; key: string }) =>
  slotKey("codeword", p.id, fingerprint(p.grid, p.key));

export const wordgameSlot = (p: { id: string; answer: string }) =>
  slotKey("wordgame", p.id, fingerprint([[LENGTH, TRIES]], p.answer));

export const solveforxSlot = (p: Seeded) =>
  slotKey("solveforx", p.id, fingerprint([[p.seed]], String(p.seed)));

export const slideSlot = (p: Seeded) =>
  slotKey("slide", p.id, fingerprint([[p.seed]], String(p.seed)));

export const cryptogramSlot = (p: { id: string; key: string }) =>
  slotKey("cryptogram", p.id, fingerprint([[p.key.length]], p.key));

export const blocksSlot = (p: {
  id: string;
  blocks: { x: number; y: number; w: number; h: number }[];
  gate: { edge: string; at: number; len: number };
}) =>
  slotKey(
    "blocks",
    p.id,
    fingerprint(
      p.blocks.map((b) => [b.x, b.y, b.w, b.h]),
      `${p.gate.edge}${p.gate.at}${p.gate.len}`
    )
  );

export const wordtraySlot = (p: { id: string; w: number; h: number; letters: string }) =>
  slotKey("wordtray", p.id, fingerprint([[p.w, p.h]], p.letters));

export const jigsawSlot = (p: { id: string; given: number[]; regions: number[] }) =>
  slotKey("jigsaw", p.id, fingerprint([p.given], p.regions.join("")));

export const waterSlot = (p: { id: string; tubes: number[][]; colours: number }) =>
  slotKey("water", p.id, fingerprint(p.tubes, String(p.colours)));

/* ── the runs ─────────────────────────────────────────────────────────────────
   These two have no archive to count against, so nothing outside the board
   builds their slot. They live here anyway so that the rule of "slots are
   defined in one place" has no exceptions to remember.
── */

export const blockoutSlot = (seed: number, run: number) =>
  slotKey("blockout", `run-${run}`, fingerprint([[seed]], String(seed)));

/** The round is part of the id: a run is a sequence of boards, not one board. */
export const freeatroSlot = (deal: { id: string; seed: number }, round: number) =>
  slotKey("freeatro", `${deal.id}-r${round}`, fingerprint([[deal.seed]], String(deal.seed)));
