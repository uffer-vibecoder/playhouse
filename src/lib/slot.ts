/**
 * The grammar of a save slot. Zero imports, so it can be tested directly.
 *
 * A slot is `<gameId>:<puzzleId>:<fingerprint>`, and it is the only thing that
 * truly knows which game a save belongs to. The `game_id` column in the
 * database is a denormalised copy kept for indexing — and a copy is a thing
 * that can disagree with the original. It did: `mergeLocalIntoCloud` uploaded
 * *every* local save but stamped them all with whichever game the player
 * happened to have open when they signed in, so a half-finished codeword
 * arrived in the cloud labelled `wordtray` and disappeared from codeword's
 * picker.
 *
 * That is why this lives apart from the storage code that used to own it. The
 * rule is now: the slot is written once, everything else is derived from it,
 * and this file is where the derivation is defined and checked.
 */

/**
 * A short hash of the puzzle's own shape.
 *
 * In the slot because ids are only unique within a pack: two packs both
 * numbering from CW-001 would otherwise restore each other's letters onto
 * different grids. It also means changing a puzzle retires its old saves
 * instead of loading answers onto a board they no longer fit.
 */
export function fingerprint(grid: number[][], key: string): string {
  let h = 2166136261;
  const s = grid.flat().join(",") + "|" + key;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export const slotKey = (gameId: string, puzzleId: string, fp: string) =>
  `${gameId}:${puzzleId}:${fp}`;

/** Which game a slot belongs to. The authoritative answer. */
export const gameOf = (slot: string) => slot.split(":")[0] ?? "";

/** Which puzzle within that game. Empty when the slot is not one of ours. */
export const puzzleOf = (slot: string) => slot.split(":")[1] ?? "";

/** Does this slot belong to this game? Used in place of trusting `game_id`. */
export const isFrom = (slot: string, gameId: string) => gameOf(slot) === gameId;
