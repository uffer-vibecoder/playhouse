/**
 * Jigsaw sudoku — the usual 1–9 in every row and column, but the nine boxes are
 * nine connected shapes instead of nine 3×3 squares.
 *
 * Zero imports, like every engine here.
 *
 * ── The solver is the whole game ────────────────────────────────────────────
 *
 * Everything hard about this lives in one place. Making a puzzle needs three
 * questions answered: can these shapes hold a filling at all, what is one, and
 * once clues are dug out, is exactly one filling left? All three are the same
 * search, so it is written once, as exact cover.
 *
 * Two earlier attempts are worth knowing about because both were wrong in the
 * same way — they blamed the input for a weak search:
 *
 *   1. Plain cell-by-cell backtracking capped out on four boards in five.
 *   2. Most-constrained-cell backtracking still capped on one in five at *five
 *      million* steps, while proving exactly zero boards impossible.
 *
 * That second number is the tell. If a search never proves anything impossible
 * and merely runs out of budget, the search is flailing, not the input. Exact
 * cover with dancing links settles the same boards in a median of ~500 steps.
 *
 * ── Why the regions are not generated here ──────────────────────────────────
 *
 * They are built by the generator, not at play time, because the only way to
 * know a set of shapes works is to try to fill it and 28% of them cannot be.
 * Boards are proved before they ship, like every other archive here.
 */

export type Tier = "easy" | "gentle" | "steady" | "tricky";

export type Puzzle = {
  id: string;
  /** which of the nine regions each of the 81 cells belongs to, 0–8 */
  regions: number[];
  /** the clues; 0 where the cell is left blank */
  given: number[];
  /** the one filling those clues admit — proved unique before shipping */
  solution: number[];
  clues: number;
  tier: Tier;
};

export type State = {
  /** what the player has written; 0 for empty. Givens are copied in and never
   *  change, so one array answers "what is in this cell" everywhere. */
  entries: number[];
  /**
   * Pencil marks, one bitmask per cell: bit v set means v is pencilled in.
   *
   * A mask rather than a list of numbers per cell. Nine booleans is exactly
   * what this is, it makes "is 4 pencilled here" a single test, and it keeps
   * the save one number per cell instead of an array per cell.
   */
  marks: number[];
};

export type Saved = { entries: number[]; marks?: number[] };

export const SIZE = 9;
const CELLS = SIZE * SIZE;
/** bits 1..9 — the shape of a pencil-mark mask, and of a candidate set */
const ALL = 0b1111111110;

export function initialState(puzzle: Puzzle, restored?: Saved): State {
  const entries = [...puzzle.given];
  const marks = new Array<number>(CELLS).fill(0);
  if (restored?.entries?.length === CELLS) {
    for (let c = 0; c < CELLS; c++) {
      // a given always wins: a save from an older cut of the archive could
      // otherwise overwrite a clue and make the puzzle unsolvable
      if (puzzle.given[c]) continue;
      const v = restored.entries[c];
      if (Number.isInteger(v) && v >= 0 && v <= 9) entries[c] = v;
      const m = restored.marks?.[c];
      if (Number.isInteger(m) && m! >= 0) marks[c] = m! & ALL;
    }
  }
  return { entries, marks };
}

/** Only the dug cells are worth saving; the clues are in the archive. */
export const toSave = (puzzle: Puzzle, s: State): Saved => ({
  entries: s.entries.map((v, c) => (puzzle.given[c] ? 0 : v)),
  marks: s.marks.map((m, c) => (puzzle.given[c] ? 0 : m)),
});

/* ── writing ──────────────────────────────────────────────────────────────── */

export const isGiven = (puzzle: Puzzle, cell: number) => puzzle.given[cell] !== 0;

export function write(puzzle: Puzzle, s: State, cell: number, value: number): State {
  if (isGiven(puzzle, cell)) return s;
  if (s.entries[cell] === value) return s;
  const entries = [...s.entries];
  entries[cell] = value;
  /* Writing a number clears that cell's pencil marks — they were notes about
     what might go here, and something now does. Marks in *other* cells are
     left alone on purpose: rubbing them out automatically would erase work the
     player has not agreed to lose, and be wrong the moment they change their
     mind about this cell. */
  const marks = [...s.marks];
  marks[cell] = 0;
  return { entries, marks };
}

/**
 * Pencil in a candidate, or rub it out if it is already there.
 *
 * Only in an empty cell. Notes about what might go somewhere are meaningless
 * once something is written there, and silently discarding the number to make
 * room for a note would be a surprising way to lose an answer.
 */
export function note(puzzle: Puzzle, s: State, cell: number, value: number): State {
  if (isGiven(puzzle, cell) || s.entries[cell]) return s;
  const marks = [...s.marks];
  marks[cell] ^= 1 << value;
  return { entries: s.entries, marks };
}

export const hasNote = (s: State, cell: number, value: number) =>
  (s.marks[cell] & (1 << value)) !== 0;

export const notesIn = (s: State, cell: number): number[] =>
  Array.from({ length: 9 }, (_, i) => i + 1).filter((v) => hasNote(s, cell, v));

/** Writing the value already there clears it — one control, not two. */
export function toggle(puzzle: Puzzle, s: State, cell: number, value: number): State {
  return write(puzzle, s, cell, s.entries[cell] === value ? 0 : value);
}

/** Rub out whatever is in a cell — the number if there is one, else the notes. */
export function erase(puzzle: Puzzle, s: State, cell: number): State {
  if (isGiven(puzzle, cell)) return s;
  if (s.entries[cell]) return write(puzzle, s, cell, 0);
  if (!s.marks[cell]) return s;
  const marks = [...s.marks];
  marks[cell] = 0;
  return { entries: s.entries, marks };
}

/* ── seeing ───────────────────────────────────────────────────────────────── */

export const rowOf = (cell: number) => Math.floor(cell / SIZE);
export const colOf = (cell: number) => cell % SIZE;

/** Every cell that must differ from this one: its row, its column, its shape. */
export function peers(regions: number[], cell: number): number[] {
  const y = rowOf(cell), x = colOf(cell), g = regions[cell];
  const out: number[] = [];
  for (let c = 0; c < CELLS; c++) {
    if (c === cell) continue;
    if (rowOf(c) === y || colOf(c) === x || regions[c] === g) out.push(c);
  }
  return out;
}

/**
 * Cells that clash with another cell.
 *
 * Reported rather than prevented. Refusing to write a clashing number sounds
 * helpful and takes away the move that solves most sudoku: put it in, see what
 * it breaks, take it out again.
 */
export function conflicts(puzzle: Puzzle, s: State): Set<number> {
  const bad = new Set<number>();
  const check = (group: number[]) => {
    const seen = new Map<number, number[]>();
    for (const c of group) {
      const v = s.entries[c];
      if (!v) continue;
      const at = seen.get(v);
      if (at) at.push(c);
      else seen.set(v, [c]);
    }
    for (const at of seen.values()) if (at.length > 1) for (const c of at) bad.add(c);
  };

  for (let i = 0; i < SIZE; i++) {
    const row: number[] = [], col: number[] = [], reg: number[] = [];
    for (let c = 0; c < CELLS; c++) {
      if (rowOf(c) === i) row.push(c);
      if (colOf(c) === i) col.push(c);
      if (puzzle.regions[c] === i) reg.push(c);
    }
    check(row); check(col); check(reg);
  }
  return bad;
}

export const isFull = (s: State) => s.entries.every((v) => v !== 0);

/** Solved means it matches the one answer — which is also the only full grid
 *  with no clash, since the puzzle was proved unique before it shipped. */
export const isSolved = (puzzle: Puzzle, s: State) =>
  s.entries.every((v, c) => v === puzzle.solution[c]);

/** How much is done, for a progress line. Givens do not count as work. */
export function progress(puzzle: Puzzle, s: State): { done: number; total: number } {
  let done = 0, total = 0;
  for (let c = 0; c < CELLS; c++) {
    if (puzzle.given[c]) continue;
    total++;
    if (s.entries[c] === puzzle.solution[c]) done++;
  }
  return { done, total };
}

/* ── exact cover ──────────────────────────────────────────────────────────────
   Every (cell, value) placement meets four requirements: that cell is filled,
   that value appears once in its row, once in its column, once in its region.
   729 placements, 324 requirements, choose placements so each requirement is
   met exactly once.
── */

type Links = {
  L: Int32Array; R: Int32Array; U: Int32Array; D: Int32Array;
  COL: Int32Array; ROW: Int32Array; size: Int32Array; head: number;
};

const COLS = 324;

function build(rows: number[][]): Links {
  let nodes = COLS + 1;
  for (const r of rows) nodes += r.length;

  const L = new Int32Array(nodes), R = new Int32Array(nodes);
  const U = new Int32Array(nodes), D = new Int32Array(nodes);
  const COL = new Int32Array(nodes), ROW = new Int32Array(nodes);
  const size = new Int32Array(COLS);
  const head = COLS;

  for (let c = 0; c <= head; c++) {
    L[c] = c === 0 ? head : c - 1;
    R[c] = c === head ? 0 : c + 1;
    U[c] = c; D[c] = c; COL[c] = c; ROW[c] = -1;
  }

  let n = COLS + 1;
  for (let r = 0; r < rows.length; r++) {
    let first = -1;
    for (const c of rows[r]) {
      const node = n++;
      COL[node] = c; ROW[node] = r;
      U[node] = U[c]; D[node] = c; D[U[c]] = node; U[c] = node;
      size[c]++;
      if (first < 0) { first = node; L[node] = node; R[node] = node; }
      else { L[node] = L[first]; R[node] = first; R[L[first]] = node; L[first] = node; }
    }
  }
  return { L, R, U, D, COL, ROW, size, head };
}

function cover(m: Links, c: number) {
  const { L, R, U, D, COL, size } = m;
  L[R[c]] = L[c]; R[L[c]] = R[c];
  for (let i = D[c]; i !== c; i = D[i])
    for (let j = R[i]; j !== i; j = R[j]) { U[D[j]] = U[j]; D[U[j]] = D[j]; size[COL[j]]--; }
}

function uncover(m: Links, c: number) {
  const { L, R, U, D, COL, size } = m;
  for (let i = U[c]; i !== c; i = U[i])
    for (let j = L[i]; j !== i; j = L[j]) { size[COL[j]]++; U[D[j]] = j; D[U[j]] = j; }
  L[R[c]] = c; R[L[c]] = c;
}

type Run = {
  want: number; found: number; steps: number; budget: number; capped: boolean;
  rng: (() => number) | null; first: number[] | null;
};

function search(m: Links, run: Run, stack: number[]): boolean {
  const { R, L, D, COL, ROW, size, head } = m;
  if (R[head] === head) {
    run.found++;
    if (!run.first) run.first = [...stack];
    return run.found >= run.want;
  }
  if (++run.steps > run.budget) { run.capped = true; return true; }

  let best = -1, least = Infinity;
  for (let c = R[head]; c !== head; c = R[c])
    if (size[c] < least) { least = size[c]; best = c; if (least <= 1) break; }
  if (least === 0) return false;

  /* Candidates in a random order when a generator asked for one. Fixed order
     both thrashes on an empty jigsaw grid and would hand every puzzle the
     identical filled grid. */
  const cand: number[] = [];
  for (let i = D[best]; i !== best; i = D[i]) cand.push(i);
  if (run.rng) for (let a = cand.length - 1; a > 0; a--) {
    const b = Math.floor(run.rng() * (a + 1));
    [cand[a], cand[b]] = [cand[b], cand[a]];
  }

  cover(m, best);
  for (const i of cand) {
    stack.push(ROW[i]);
    for (let j = R[i]; j !== i; j = R[j]) cover(m, COL[j]);
    const stop = search(m, run, stack);
    for (let j = L[i]; j !== i; j = L[j]) uncover(m, COL[j]);
    stack.pop();
    if (stop) { uncover(m, best); return true; }
  }
  uncover(m, best);
  return false;
}

function matrix(regions: number[], given?: number[] | null) {
  const rows: number[][] = [];
  const placement: number[] = [];
  for (let cell = 0; cell < CELLS; cell++) {
    const y = rowOf(cell), x = colOf(cell), g = regions[cell];
    for (let v = 1; v <= 9; v++) {
      if (given && given[cell] && given[cell] !== v) continue;
      rows.push([cell, 81 + y * 9 + (v - 1), 162 + x * 9 + (v - 1), 243 + g * 9 + (v - 1)]);
      placement.push(cell * 9 + (v - 1));
    }
  }
  return { rows, placement };
}

const run = (want: number, budget: number, rng: (() => number) | null): Run =>
  ({ want, found: 0, steps: 0, budget, capped: false, rng, first: null });

/**
 * One filling, or null if these shapes and clues admit none.
 *
 * `"capped"` is a third answer, kept apart from `null` on purpose: "no filling
 * exists" and "I gave up looking" are different facts and a generator that
 * conflates them cannot be tuned.
 */
export function solve(
  regions: number[],
  given?: number[] | null,
  budget = 200_000,
  rng: (() => number) | null = null
): number[] | null | "capped" {
  const { rows, placement } = matrix(regions, given);
  const m = build(rows);
  const r = run(1, budget, rng);
  search(m, r, []);
  if (!r.first) return r.capped ? "capped" : null;
  const grid = new Array<number>(CELLS).fill(0);
  for (const row of r.first) {
    const p = placement[row];
    grid[Math.floor(p / 9)] = (p % 9) + 1;
  }
  return grid;
}

/**
 * How many fillings, counted no further than `cap`.
 *
 * Two is the only number that matters when digging clues: one means the puzzle
 * still has a single answer, two means the last cell taken out has to go back.
 */
export function countSolutions(
  regions: number[],
  given: number[],
  cap = 2,
  budget = 200_000
): { n: number; capped: boolean } {
  const { rows } = matrix(regions, given);
  const m = build(rows);
  const r = run(cap, budget, null);
  search(m, r, []);
  return { n: r.found, capped: r.capped };
}

export const hasOneSolution = (regions: number[], given: number[], budget = 200_000) => {
  const { n, capped } = countSolutions(regions, given, 2, budget);
  return !capped && n === 1;
};

/* ── solving it the way a person does ─────────────────────────────────────────
   Exact cover proves a puzzle has one answer. It does *not* say the answer can
   be reasoned to, and that is the difference between a sudoku and a chore:
   dug as far as it will go, a jigsaw board lands around fourteen clues, is
   still perfectly unique, and cannot be finished by anyone without guessing.

   So the generator digs against this instead — the two techniques that make up
   ordinary solving:

     naked single — a cell with only one candidate left
     hidden single — a value with only one place left in a row, column or shape

   If a board falls to these, every step of it can be explained, which is the
   only difficulty measure worth having here.
── */

export type Technique = "naked" | "hidden";

/** Work the board with singles alone. Reports how far it got, and on what. */
export function deduce(
  regions: number[],
  given: number[],
  allow: Technique[] = ["naked", "hidden"]
): { grid: number[]; solved: boolean; used: Set<Technique>; steps: Record<Technique, number> } {
  const grid = [...given];
  const used = new Set<Technique>();
  /* Counted, not just flagged. How *often* a board needs the harder technique
     is the difficulty, and it is not the same thing as how few clues it has:
     boards dug to 19 clues and to 23 turned out to be the same puzzle to
     solve, while the number of hidden singles needed told them apart. */
  const steps: Record<Technique, number> = { naked: 0, hidden: 0 };

  /* groups: nine rows, nine columns, nine shapes */
  const groups: number[][] = [];
  for (let i = 0; i < SIZE; i++) {
    const row: number[] = [], col: number[] = [], reg: number[] = [];
    for (let c = 0; c < CELLS; c++) {
      if (rowOf(c) === i) row.push(c);
      if (colOf(c) === i) col.push(c);
      if (regions[c] === i) reg.push(c);
    }
    groups.push(row, col, reg);
  }
  const groupsOf: number[][][] = Array.from({ length: CELLS }, () => []);
  for (const g of groups) for (const c of g) groupsOf[c].push(g);

  const candidates = (c: number) => {
    if (grid[c]) return 0;
    let mask = ALL;
    for (const g of groupsOf[c]) for (const p of g) if (grid[p]) mask &= ~(1 << grid[p]);
    return mask;
  };

  for (;;) {
    let moved = false;

    if (allow.includes("naked")) {
      for (let c = 0; c < CELLS && !moved; c++) {
        if (grid[c]) continue;
        const mask = candidates(c);
        if (mask === 0) return { grid, solved: false, used, steps }; // a contradiction
        if ((mask & (mask - 1)) === 0) {
          grid[c] = 31 - Math.clz32(mask);
          used.add("naked");
          steps.naked++;
          moved = true;
        }
      }
    }

    if (!moved && allow.includes("hidden")) {
      for (const g of groups) {
        for (let v = 1; v <= 9 && !moved; v++) {
          if (g.some((c) => grid[c] === v)) continue;
          let where = -1, count = 0;
          for (const c of g) {
            if (grid[c]) continue;
            if (candidates(c) & (1 << v)) { where = c; count++; }
          }
          if (count === 0) return { grid, solved: false, used, steps }; // nowhere to put it
          if (count === 1) { grid[where] = v; used.add("hidden"); steps.hidden++; moved = true; }
        }
        if (moved) break;
      }
    }

    if (!moved) break;
  }

  return { grid, solved: grid.every((v) => v !== 0), used, steps };
}

/** Can a person finish this board without guessing? */
export const isReasonable = (regions: number[], given: number[]) =>
  deduce(regions, given).solved;
