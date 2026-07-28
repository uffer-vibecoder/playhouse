/**
 * Word Tray — seven letters, and a small crossword made only of what they spell.
 *
 * Zero imports, like every engine here.
 *
 * ── Why this one matters beyond being a good game ───────────────────────────
 *
 * It is crossword construction with **no clue writing**. The letters are the
 * clue. Clue writing — one hand-authored line per entry — is exactly what
 * parked the themed crosswords, so this is the realistic route back to that
 * ambition, and everything learned filling these grids applies there.
 *
 * The open question was whether the fill would work when the vocabulary is not
 * tens of thousands of words but the twenty-odd a single tray makes. Measured
 * before any of this was written: a median of 27 words per tray, and six or
 * more packed into a grid for 199 trays out of 199. So it does.
 *
 * ── Found, bonus, and wrong ─────────────────────────────────────────────────
 *
 * Three outcomes, and the middle one is the point. A word in the grid fills it
 * in. A real word the tray makes but the grid does not hold is a **bonus** —
 * kept, counted, and never called wrong, because being told "no" for spelling
 * something real is the fastest way to stop wanting to play. Anything else is
 * simply not a word here.
 */

export type Placed = { word: string; x: number; y: number; across: boolean };

export type Puzzle = {
  id: string;
  /** the seven letters, as dealt */
  letters: string;
  w: number;
  h: number;
  words: Placed[];
  /** every other word the tray makes, so a bonus can be recognised offline */
  bonus: string[];
};

export type State = {
  /** grid words found, in the order they were found */
  found: string[];
  /** real words the tray makes that the grid does not hold */
  extras: string[];
  /** what is being spelled right now, as letter positions in the tray */
  picked: number[];
};

export type Saved = { found: string[]; extras: string[] };

export function initialState(puzzle: Puzzle, restored?: Saved): State {
  const inGrid = new Set(puzzle.words.map((p) => p.word));
  const spare = new Set(puzzle.bonus);
  return {
    // filtered on the way in: a save from an older archive could otherwise
    // restore a word this tray no longer holds and leave the grid unfillable
    found: (restored?.found ?? []).filter((w) => inGrid.has(w)),
    extras: (restored?.extras ?? []).filter((w) => spare.has(w)),
    picked: [],
  };
}

export const toSave = (s: State): Saved => ({ found: s.found, extras: s.extras });

/* ── the grid ─────────────────────────────────────────────────────────────── */

export type Cell = { x: number; y: number; letter: string; words: string[] };

/**
 * The grid as cells, derived rather than stored.
 *
 * The archive ships word placements only; two placements crossing agree on the
 * shared letter (the builder checks that), so the grid falls out of them and
 * there is nothing to keep in step.
 */
export function cells(puzzle: Puzzle): Cell[] {
  const map = new Map<string, Cell>();
  for (const { word, x, y, across } of puzzle.words) {
    for (let i = 0; i < word.length; i++) {
      const cx = across ? x + i : x;
      const cy = across ? y : y + i;
      const k = `${cx},${cy}`;
      const found = map.get(k);
      if (found) found.words.push(word);
      else map.set(k, { x: cx, y: cy, letter: word[i], words: [word] });
    }
  }
  return [...map.values()];
}

/** Which cells a found word lights up. */
export const cellsOf = (p: Placed): string[] =>
  Array.from({ length: p.word.length }, (_, i) =>
    p.across ? `${p.x + i},${p.y}` : `${p.x},${p.y + i}`
  );

/* ── spelling ─────────────────────────────────────────────────────────────── */

export const spelling = (puzzle: Puzzle, s: State) =>
  s.picked.map((i) => puzzle.letters[i]).join("");

/** Tap a letter. The same letter twice in a row is a mistake, not a repeat. */
export function pick(s: State, index: number): State {
  if (s.picked.includes(index)) return s;
  return { ...s, picked: [...s.picked, index] };
}

export const unpick = (s: State): State =>
  s.picked.length ? { ...s, picked: s.picked.slice(0, -1) } : s;

export const clearPick = (s: State): State => (s.picked.length ? { ...s, picked: [] } : s);

export type Outcome = "found" | "again" | "bonus" | "no";

/** What would happen to this word, without changing anything. */
export function judge(puzzle: Puzzle, s: State, word: string): Outcome {
  if (word.length < 3) return "no";
  if (s.found.includes(word) || s.extras.includes(word)) return "again";
  if (puzzle.words.some((p) => p.word === word)) return "found";
  if (puzzle.bonus.includes(word)) return "bonus";
  return "no";
}

/**
 * Submit whatever is spelled.
 *
 * Always clears the pick, whatever the answer — leaving a rejected word sitting
 * there to be edited sounds helpful and in practice means every wrong guess
 * costs a tap to clear before the next one.
 */
export function submit(puzzle: Puzzle, s: State): { state: State; outcome: Outcome; word: string } {
  const word = spelling(puzzle, s);
  const outcome = judge(puzzle, s, word);
  const state: State = {
    found: outcome === "found" ? [...s.found, word] : s.found,
    extras: outcome === "bonus" ? [...s.extras, word] : s.extras,
    picked: [],
  };
  return { state, outcome, word };
}

export const isSolved = (puzzle: Puzzle, s: State) =>
  puzzle.words.every((p) => s.found.includes(p.word));

/**
 * A letter order for the tray that is not the answer.
 *
 * The archive stores the letters as the root word spelled out, so dealing them
 * in that order would put a seven-letter answer in plain sight. Shuffled from
 * the puzzle id so it is stable across reloads — a tray that rearranged itself
 * every time you looked would be exhausting.
 */
export function trayOrder(puzzle: Puzzle): number[] {
  let a = 0;
  for (const ch of puzzle.id) a = (Math.imul(a, 31) + ch.charCodeAt(0)) >>> 0;
  const order = puzzle.letters.split("").map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    a = (Math.imul(a ^ (a >>> 15), 1 | a) + 0x6d2b79f5) >>> 0;
    const j = a % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
