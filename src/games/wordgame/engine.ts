/**
 * The word game's rules, with no idea that a browser exists.
 *
 * Same contract as the codeword engine next door: no DOM, no React, no imports
 * at all. Every function is pure and returns a new State rather than mutating
 * one, so the React side owns a single useState and calls these as reducers.
 * That is also what makes the scoring testable without rendering anything,
 * which matters more here than usual — see `score`.
 */

export type Puzzle = {
  id: string;
  /** base64 of the answer. See `answerOf` for why, and why it is not security. */
  answer: string;
  /** batch date, for the "new since you were last here" marker */
  added?: string;
};

/** hit = right letter, right place. near = right letter, wrong place. */
export type Mark = "hit" | "near" | "miss";

export type State = {
  /** guesses already submitted, in order */
  guesses: string[];
  /** the row being typed, not yet submitted */
  current: string;
  status: "playing" | "won" | "lost";
  /** transient feedback — "not a word", "needs 5 letters" */
  notice: string | null;
};

export const LENGTH = 5;
export const TRIES = 6;
export const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/**
 * Colouring a guess needs the answer in the browser, so unlike the codeword
 * pack — which ships no answers at all — this archive contains them. base64
 * keeps them out of casual view in devtools and nothing more: anyone who wants
 * the answer can have it in one line. Making that actually safe would mean a
 * server round trip per guess, which is not a trade worth making here.
 */
export function answerOf(puzzle: Puzzle): string {
  return atob(puzzle.answer).toUpperCase();
}

/**
 * Mark a guess against an answer.
 *
 * Two passes, and it has to be two. The tempting single pass — "green if it
 * matches here, else yellow if the answer contains it" — double-counts a
 * repeated letter: guessing ERASE against SPEED marks both E's, when the answer
 * has only one E left to give once the exact matches are taken out.
 *
 * So pass one claims the exact matches and tallies only what they leave behind;
 * pass two spends that tally left to right. A letter goes yellow only while
 * there is still one unaccounted for in the answer.
 */
export function score(answer: string, guess: string): Mark[] {
  const a = answer.toUpperCase();
  const g = guess.toUpperCase();
  const marks: Mark[] = new Array(g.length).fill("miss");
  const spare = new Map<string, number>();

  for (let i = 0; i < a.length; i++) {
    if (g[i] === a[i]) marks[i] = "hit";
    else spare.set(a[i], (spare.get(a[i]) ?? 0) + 1);
  }

  for (let i = 0; i < g.length; i++) {
    if (marks[i] === "hit") continue;
    const left = spare.get(g[i]) ?? 0;
    if (left > 0) {
      marks[i] = "near";
      spare.set(g[i], left - 1);
    }
  }

  return marks;
}

/** What gets persisted — the guesses alone; everything else is derived. */
export type Saved = { guesses: string[] };

export function initialState(puzzle: Puzzle, restored?: Saved): State {
  const guesses = (restored?.guesses ?? [])
    .map((g) => String(g).toUpperCase())
    .filter((g) => /^[A-Z]+$/.test(g) && g.length === LENGTH)
    .slice(0, TRIES);

  const answer = answerOf(puzzle);
  const won = guesses.some((g) => g === answer);
  return {
    guesses,
    current: "",
    status: won ? "won" : guesses.length >= TRIES ? "lost" : "playing",
    notice: null,
  };
}

export function typeLetter(s: State, letter: string): State {
  if (s.status !== "playing" || s.current.length >= LENGTH) return s;
  const ch = letter.toUpperCase();
  if (!/^[A-Z]$/.test(ch)) return s;
  return { ...s, current: s.current + ch, notice: null };
}

export function backspace(s: State): State {
  if (s.status !== "playing" || !s.current) return s;
  return { ...s, current: s.current.slice(0, -1), notice: null };
}

export function dismissNotice(s: State): State {
  return s.notice === null ? s : { ...s, notice: null };
}

/**
 * Submit the current row.
 *
 * `isWord` is injected rather than imported so the engine stays dependency
 * free and a test can pass its own vocabulary. Rejecting a real word is the
 * most irritating failure this game has, so the caller should supply a
 * generous list.
 */
export function submit(puzzle: Puzzle, s: State, isWord: (w: string) => boolean): State {
  if (s.status !== "playing") return s;
  if (s.current.length < LENGTH) {
    return { ...s, notice: `Needs ${LENGTH} letters` };
  }
  if (!isWord(s.current)) {
    return { ...s, notice: "Not a word I know" };
  }

  const guesses = [...s.guesses, s.current];
  const won = s.current === answerOf(puzzle);
  return {
    guesses,
    current: "",
    status: won ? "won" : guesses.length >= TRIES ? "lost" : "playing",
    notice: null,
  };
}

/**
 * The best result each letter has earned, for colouring the keyboard.
 * Never downgraded: a letter shown green stays green even if a later guess
 * puts it in the wrong place.
 */
export function keyboardMarks(puzzle: Puzzle, s: State): Record<string, Mark> {
  const rank: Record<Mark, number> = { miss: 0, near: 1, hit: 2 };
  const answer = answerOf(puzzle);
  const best: Record<string, Mark> = {};

  for (const guess of s.guesses) {
    const marks = score(answer, guess);
    for (let i = 0; i < guess.length; i++) {
      const ch = guess[i];
      if (!best[ch] || rank[marks[i]] > rank[best[ch]]) best[ch] = marks[i];
    }
  }
  return best;
}

export const isSolved = (s: State) => s.status === "won";
export const isOver = (s: State) => s.status !== "playing";
export const toSave = (s: State): Saved => ({ guesses: s.guesses });

/**
 * The shareable result.
 *
 * Deliberately carries no letters — the whole point is that it can be sent to
 * someone who has not played this puzzle yet.
 */
export function shareGrid(puzzle: Puzzle, s: State, label: string): string {
  const answer = answerOf(puzzle);
  const glyph: Record<Mark, string> = { hit: "🟩", near: "🟨", miss: "⬜" };
  const rows = s.guesses.map((g) => score(answer, g).map((m) => glyph[m]).join(""));
  const tally = s.status === "won" ? `${s.guesses.length}/${TRIES}` : `X/${TRIES}`;
  return [`${label} ${puzzle.id} — ${tally}`, "", ...rows].join("\n");
}
