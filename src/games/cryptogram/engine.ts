/**
 * Cryptogram — a sentence with every letter replaced by a number.
 *
 * Same contract as the other engines: no DOM, no React, no imports, pure
 * functions returning new State.
 *
 * This is codeword's mechanic on a line of text rather than a grid, and it
 * deliberately keeps codeword's state shape — a code-to-letter assignment plus
 * a locked set — so the two games feel like siblings and the letters-used
 * tracker means the same thing in both.
 *
 * The hard part is not here. It is in scripts/build-cryptogram.mjs, which
 * proves every text has exactly one reading before it ships: a short or
 * repetitive sentence can be decoded several different ways, all of them real
 * English, and a player who lands on one of the others is stuck for no reason
 * of their own. The starters exist to kill those alternatives, and are chosen
 * where the readings actually disagree.
 */

export type Puzzle = {
  id: string;
  /** base64 of the plaintext, uppercase, letters and `,` and `.` only. */
  text: string;
  /** `key[c - 1]` is the letter standing behind code c. */
  key: string;
  /** Codes revealed from the start. */
  given: number[];
  /** A nudge at what the sentence is about — never a word from it. */
  topic?: string;
  added?: string;
};

export type Assignment = Record<number, string>;

export type State = {
  assign: Assignment;
  /** Starters and revealed letters — not editable. */
  locked: Set<number>;
  /** The code being edited, not a position: filling one fills every copy. */
  cursor: number | null;
  /** Marked by Check, cleared shortly after. */
  wrong: Set<number>;
};

/** A character of the sentence. `code` is null for spaces and punctuation. */
export type Token = { ch: string; code: number | null };

export const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export const plainOf = (p: Puzzle) => atob(p.text).toUpperCase();

/** The letter behind a code, straight from the key. */
export const letterFor = (p: Puzzle, code: number) => p.key[code - 1] ?? "";

const codeIndex = (p: Puzzle) => {
  const m = new Map<string, number>();
  for (let c = 1; c <= 26; c++) m.set(p.key[c - 1], c);
  return m;
};

/**
 * The sentence as words, so the board can wrap between words and never inside
 * one. Punctuation rides along with the word it follows.
 */
export function wordsOf(p: Puzzle): Token[][] {
  const byLetter = codeIndex(p);
  const words: Token[][] = [];
  let current: Token[] = [];

  for (const ch of plainOf(p)) {
    if (ch === " ") {
      if (current.length) words.push(current);
      current = [];
      continue;
    }
    current.push({ ch, code: /[A-Z]/.test(ch) ? (byLetter.get(ch) ?? null) : null });
  }
  if (current.length) words.push(current);
  return words;
}

/** Every code actually used by this sentence, in first-appearance order. */
export function codesUsed(p: Puzzle): number[] {
  const seen: number[] = [];
  for (const word of wordsOf(p)) {
    for (const t of word) if (t.code && !seen.includes(t.code)) seen.push(t.code);
  }
  return seen;
}

export function initialState(p: Puzzle, restored?: Assignment): State {
  const assign: Assignment = {};
  const locked = new Set<number>();

  for (const code of p.given) {
    assign[code] = letterFor(p, code);
    locked.add(code);
  }

  // Restored entries are merged defensively: anything that collides with a
  // starter, or reuses a letter already spoken for, is dropped rather than
  // trusted. A save is not a source of truth about the rules.
  for (const [rawCode, rawLetter] of Object.entries(restored ?? {})) {
    const code = Number(rawCode);
    const letter = String(rawLetter).toUpperCase();
    if (!Number.isInteger(code) || code < 1 || code > 26) continue;
    if (locked.has(code) || !/^[A-Z]$/.test(letter)) continue;
    if (Object.values(assign).includes(letter)) continue;
    assign[code] = letter;
  }

  return { assign, locked, cursor: codesUsed(p)[0] ?? null, wrong: new Set() };
}

/* ── entry ──────────────────────────────────────────────────────────────── */

export function focusCode(s: State, code: number | null): State {
  return { ...s, cursor: code };
}

/**
 * Put a letter behind the focused code.
 *
 * A letter can only stand for one code, so assigning one that is already spoken
 * for takes it away from wherever it was — otherwise a player has to hunt down
 * their own earlier guess before they can correct it.
 */
export function place(s: State, letter: string): State {
  const code = s.cursor;
  const ch = letter.toUpperCase();
  if (code === null || s.locked.has(code) || !/^[A-Z]$/.test(ch)) return s;

  const assign: Assignment = {};
  for (const [k, v] of Object.entries(s.assign)) {
    if (v === ch && !s.locked.has(Number(k))) continue; // release the old holder
    assign[Number(k)] = v;
  }
  assign[code] = ch;
  return { ...s, assign, wrong: new Set() };
}

export function erase(s: State): State {
  const code = s.cursor;
  if (code === null || s.locked.has(code) || !s.assign[code]) return s;
  const assign = { ...s.assign };
  delete assign[code];
  return { ...s, assign, wrong: new Set() };
}

/** Move to the next unsolved code, so tabbing skips what is already done. */
export function step(p: Puzzle, s: State, by: number): State {
  const codes = codesUsed(p).filter((c) => !s.locked.has(c));
  if (!codes.length) return s;
  const at = s.cursor === null ? -1 : codes.indexOf(s.cursor);
  const next = codes[(at + by + codes.length * 2) % codes.length];
  return { ...s, cursor: next };
}

/* ── tools ──────────────────────────────────────────────────────────────── */

/** Mark every filled-but-wrong code. Blanks are not mistakes yet. */
export function check(p: Puzzle, s: State): State {
  const wrong = new Set<number>();
  for (const [k, v] of Object.entries(s.assign)) {
    const code = Number(k);
    if (!s.locked.has(code) && v !== letterFor(p, code)) wrong.add(code);
  }
  return { ...s, wrong };
}

export const dismissWrong = (s: State): State =>
  s.wrong.size ? { ...s, wrong: new Set() } : s;

/** Give away the focused code, or the first unsolved one. */
export function reveal(p: Puzzle, s: State): State {
  const codes = codesUsed(p);
  const target =
    s.cursor !== null && !s.locked.has(s.cursor)
      ? s.cursor
      : codes.find((c) => !s.locked.has(c) && s.assign[c] !== letterFor(p, c));
  if (target === undefined || target === null) return s;

  const right = letterFor(p, target);
  const assign: Assignment = {};
  for (const [k, v] of Object.entries(s.assign)) {
    if (v === right && Number(k) !== target) continue; // the letter is spoken for now
    assign[Number(k)] = v;
  }
  assign[target] = right;
  const locked = new Set(s.locked).add(target);
  return { ...s, assign, locked, wrong: new Set() };
}

export function clear(p: Puzzle): State {
  return initialState(p);
}

export const isSolvedPuzzle = (p: Puzzle, s: State) =>
  codesUsed(p).every((c) => s.assign[c] === letterFor(p, c));

export const lettersUsed = (s: State) => new Set(Object.values(s.assign));

/** Only the player's own entries are persisted; starters come from the puzzle. */
export function freeEntries(s: State): Assignment {
  const out: Assignment = {};
  for (const [k, v] of Object.entries(s.assign)) {
    if (!s.locked.has(Number(k))) out[Number(k)] = v;
  }
  return out;
}

/** How much is done, for a quiet sense of progress rather than a score. */
export function progress(p: Puzzle, s: State) {
  const codes = codesUsed(p);
  return { done: codes.filter((c) => s.assign[c]).length, total: codes.length };
}
