/**
 * Codeword solving engine — pure logic, no DOM, no React.
 *
 * Ported from the standalone player. Everything here is the part that survives
 * a change of platform: the word-slot model, the across/down cursor, how typing
 * advances, and the rule that a letter may stand for only one number. Keeping
 * it free of the view is what made the port cheap, and is why the same file
 * would serve a native app unchanged.
 */

export type Puzzle = {
  id: string;
  title: string;
  difficulty: string;
  theme?: string;
  size: number;
  /** size x size; 0 is a black square, 1..26 a code number */
  grid: number[][];
  /** 26 characters; key[i] is the letter for code i+1 */
  key: string;
  /** code numbers revealed as starter letters */
  given: number[];
};

export type Dir = "across" | "down";
export type Cell = { r: number; c: number };
export type Run = { dir: Dir; cells: Cell[] };

/** code -> letter */
export type Assignment = Record<number, string>;

export const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/* ── word slots ─────────────────────────────────────────────────────────── */

export type Slots = {
  runs: Run[];
  /** "r,c" -> the across and down runs through that square */
  at: Map<string, { across: Run | null; down: Run | null }>;
};

const key = (r: number, c: number) => `${r},${c}`;

/**
 * Every maximal run of two or more squares, in reading order.
 *
 * The reference player this came from tracked only which *number* was selected
 * and had no notion of a word, so typing hopped to whatever unsolved number
 * came next — frequently the far side of the grid. Solving a codeword is
 * reading along a word, so movement is expressed against these.
 */
export function buildSlots(puzzle: Puzzle): Slots {
  const { grid, size } = puzzle;
  const runs: Run[] = [];

  const push = (cells: Cell[], dir: Dir) => {
    if (cells.length >= 2) runs.push({ dir, cells: [...cells] });
  };

  for (let r = 0; r < size; r++) {
    let cells: Cell[] = [];
    for (let c = 0; c < size; c++) {
      if (grid[r][c]) cells.push({ r, c });
      else { push(cells, "across"); cells = []; }
    }
    push(cells, "across");
  }
  for (let c = 0; c < size; c++) {
    let cells: Cell[] = [];
    for (let r = 0; r < size; r++) {
      if (grid[r][c]) cells.push({ r, c });
      else { push(cells, "down"); cells = []; }
    }
    push(cells, "down");
  }

  runs.sort(
    (a, b) =>
      a.cells[0].r - b.cells[0].r ||
      a.cells[0].c - b.cells[0].c ||
      (a.dir === b.dir ? 0 : a.dir === "across" ? -1 : 1)
  );

  const at = new Map<string, { across: Run | null; down: Run | null }>();
  for (const run of runs) {
    for (const { r, c } of run.cells) {
      const k = key(r, c);
      if (!at.has(k)) at.set(k, { across: null, down: null });
      at.get(k)![run.dir] = run;
    }
  }
  return { runs, at };
}

export const slotsFor = (slots: Slots, r: number, c: number) =>
  slots.at.get(key(r, c)) ?? { across: null, down: null };

/* ── state ──────────────────────────────────────────────────────────────── */

export type State = {
  assign: Assignment;
  /** codes fixed by the starters or by Reveal — not editable */
  locked: Set<number>;
  cursor: Cell | null;
  dir: Dir;
  /** codes marked wrong by the last Check, cleared shortly after */
  wrong: Set<number>;
};

export const codeAt = (p: Puzzle, r: number, c: number) => p.grid[r][c];
export const letterFor = (p: Puzzle, code: number) => p.key[code - 1];
const inBounds = (p: Puzzle, r: number, c: number) =>
  r >= 0 && c >= 0 && r < p.size && c < p.size;

export function initialState(puzzle: Puzzle, slots: Slots, restored?: Assignment): State {
  const assign: Assignment = {};
  const locked = new Set<number>();
  for (const code of puzzle.given) {
    assign[code] = letterFor(puzzle, code);
    locked.add(code);
  }
  // restored letters must not collide with a starter, or with each other
  if (restored) {
    const taken = new Set(Object.values(assign));
    for (const [k, letter] of Object.entries(restored)) {
      const code = Number(k);
      if (locked.has(code) || taken.has(letter)) continue;
      assign[code] = letter;
      taken.add(letter);
    }
  }

  // open on the first square that still needs a letter
  let cursor: Cell | null = null;
  let dir: Dir = "across";
  const solved = (code: number) => assign[code] !== undefined;
  const first =
    slots.runs.find((run) => run.cells.some((x) => !solved(codeAt(puzzle, x.r, x.c)))) ??
    slots.runs[0];
  if (first) {
    const open = first.cells.find((x) => !solved(codeAt(puzzle, x.r, x.c))) ?? first.cells[0];
    cursor = { r: open.r, c: open.c };
    dir = first.dir;
  }

  return { assign, locked, cursor, dir, wrong: new Set() };
}

/* ── movement ───────────────────────────────────────────────────────────── */

const isSolved = (s: State, code: number) => s.assign[code] !== undefined;

export function currentRun(slots: Slots, s: State): Run | null {
  if (!s.cursor) return null;
  return slotsFor(slots, s.cursor.r, s.cursor.c)[s.dir];
}

/** Next unsolved square inside the current word, searching forward only. */
function nextInWord(p: Puzzle, slots: Slots, s: State): Cell | null {
  const run = currentRun(slots, s);
  if (!run || !s.cursor) return null;
  const i = run.cells.findIndex((x) => x.r === s.cursor!.r && x.c === s.cursor!.c);
  for (let j = i + 1; j < run.cells.length; j++) {
    const cell = run.cells[j];
    if (!isSolved(s, codeAt(p, cell.r, cell.c))) return cell;
  }
  return null;
}

/** First unsolved square of the next word that still has one. */
export function nextWordCell(
  p: Puzzle,
  slots: Slots,
  s: State,
  step = 1
): { cell: Cell; dir: Dir } | null {
  if (!slots.runs.length) return null;
  const run = currentRun(slots, s);
  const start = run ? slots.runs.indexOf(run) : -1;
  const n = slots.runs.length;
  for (let k = 1; k <= n; k++) {
    const cand = slots.runs[(start + step * k + n * k) % n];
    const open = cand.cells.find((x) => !isSolved(s, codeAt(p, x.r, x.c)));
    if (open) return { cell: open, dir: cand.dir };
  }
  return null;
}

/**
 * Where the cursor goes after a letter lands. Stay inside the word while it
 * still has unsolved squares; only then move on. This is what keeps a solver
 * reading along a word rather than being thrown across the grid.
 */
export function advance(p: Puzzle, slots: Slots, s: State): State {
  const within = nextInWord(p, slots, s);
  if (within) return { ...s, cursor: within };
  const next = nextWordCell(p, slots, s, 1);
  return next ? { ...s, cursor: next.cell, dir: next.dir } : s;
}

/** Move one square, skipping black squares. */
export function step(p: Puzzle, slots: Slots, s: State, dr: number, dc: number): State {
  if (!s.cursor) return s;
  let { r, c } = s.cursor;
  for (let i = 0; i < p.size; i++) {
    r += dr;
    c += dc;
    if (!inBounds(p, r, c)) return s;
    if (codeAt(p, r, c)) {
      const want: Dir = dr === 0 ? "across" : "down";
      const slot = slotsFor(slots, r, c);
      return { ...s, cursor: { r, c }, dir: slot[want] ? want : slot.across ? "across" : "down" };
    }
  }
  return s;
}

/** Put the cursor on a square, preferring to keep the current direction. */
export function focusCell(slots: Slots, s: State, r: number, c: number, preferred?: Dir): State {
  const slot = slotsFor(slots, r, c);
  const want = preferred ?? s.dir;
  return { ...s, cursor: { r, c }, dir: slot[want] ? want : slot.across ? "across" : "down" };
}

export function toggleDir(slots: Slots, s: State): State {
  if (!s.cursor) return s;
  const other: Dir = s.dir === "across" ? "down" : "across";
  return slotsFor(slots, s.cursor.r, s.cursor.c)[other] ? { ...s, dir: other } : s;
}

/** Put the cursor on the first square carrying a code. */
export function focusCode(p: Puzzle, slots: Slots, s: State, code: number): State {
  for (const run of slots.runs) {
    const cell = run.cells.find((x) => codeAt(p, x.r, x.c) === code);
    if (cell) return { ...s, cursor: { r: cell.r, c: cell.c }, dir: run.dir };
  }
  return s;
}

/* ── entry ──────────────────────────────────────────────────────────────── */

/** Assign a letter to the code under the cursor, then advance. */
export function place(p: Puzzle, slots: Slots, s: State, letter: string): State {
  if (!s.cursor) return s;
  const code = codeAt(p, s.cursor.r, s.cursor.c);
  if (!code || s.locked.has(code)) return s;

  const assign = { ...s.assign };
  // a letter may stand for only one number — take it back from any other code
  for (const k of Object.keys(assign)) {
    if (assign[Number(k)] === letter && !s.locked.has(Number(k))) delete assign[Number(k)];
  }
  assign[code] = letter;

  const wrong = new Set(s.wrong);
  wrong.delete(code);
  return advance(p, slots, { ...s, assign, wrong });
}

export function erase(p: Puzzle, s: State): State {
  if (!s.cursor) return s;
  const code = codeAt(p, s.cursor.r, s.cursor.c);
  if (!code || s.locked.has(code)) return s;
  const assign = { ...s.assign };
  delete assign[code];
  const wrong = new Set(s.wrong);
  wrong.delete(code);
  return { ...s, assign, wrong };
}

/* ── tools ──────────────────────────────────────────────────────────────── */

export function check(p: Puzzle, s: State): State {
  const wrong = new Set<number>();
  for (const k of Object.keys(s.assign)) {
    const code = Number(k);
    if (s.assign[code] !== letterFor(p, code)) wrong.add(code);
  }
  return { ...s, wrong };
}

/** Reveal one correct letter and lock it. */
export function reveal(p: Puzzle, slots: Slots, s: State): State {
  const open: number[] = [];
  for (let code = 1; code <= 26; code++) {
    if (s.assign[code] !== letterFor(p, code)) open.push(code);
  }
  if (!open.length) return s;

  const code = open[Math.floor(Math.random() * open.length)];
  const letter = letterFor(p, code);
  const assign = { ...s.assign };
  for (const k of Object.keys(assign)) {
    if (assign[Number(k)] === letter && !s.locked.has(Number(k))) delete assign[Number(k)];
  }
  assign[code] = letter;

  const locked = new Set(s.locked);
  locked.add(code);
  const wrong = new Set(s.wrong);
  wrong.delete(code);
  return focusCode(p, slots, { ...s, assign, locked, wrong }, code);
}

export function clear(p: Puzzle, slots: Slots): State {
  return initialState(p, slots);
}

export const isSolvedPuzzle = (p: Puzzle, s: State) =>
  Array.from({ length: 26 }, (_, i) => i + 1).every(
    (code) => s.assign[code] === letterFor(p, code)
  );

/** Letters currently spoken for, for the used-letter tracker. */
export const lettersUsed = (s: State) => new Set(Object.values(s.assign));

/** Only the player's own entries — starters are implied by the puzzle. */
export function freeEntries(s: State): Assignment {
  const out: Assignment = {};
  for (const k of Object.keys(s.assign)) {
    const code = Number(k);
    if (!s.locked.has(code)) out[code] = s.assign[code];
  }
  return out;
}
