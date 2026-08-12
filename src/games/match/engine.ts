/**
 * Orchard — swap two neighbours, make a line of three, and the fruit comes off.
 *
 * Zero imports, like every engine here.
 *
 * ── What this game can and cannot promise ───────────────────────────────────
 *
 * Every archive on this site ships proved: Water Sort's par is the shortest
 * solution, Jigsaw's boards are proved to have exactly one answer, Colour
 * Blocks re-proves its par on every build. Match-three cannot join them, and it
 * is worth saying so plainly rather than pretending.
 *
 * The reason is cascades. A swap clears some fruit, the rest falls, new fruit
 * arrives, and that may clear again — so one move is a chain of unknown length,
 * and the branching after twenty moves is far past anything a search settles.
 * There is no "shortest solution" to find and no uniqueness to prove.
 *
 * So the promise is the other one this site makes, the one Free-Atro's targets
 * and Smallholding's ladder are built on: **the target is measured.** A scripted
 * player plays every board and the target is set from what it scores. That is a
 * weaker claim than a proof and it is an honest one.
 *
 * ── Which means the game has to be deterministic ────────────────────────────
 *
 * A measured target is worthless if the same board plays differently each time,
 * so nothing here is random at play time. The refills come from a seeded stream
 * and the position in that stream is part of the state, so a board plus a list
 * of swaps always gives the same score. `Math.random` appears nowhere.
 */

export type Fruit = number; // 0..COLOURS-1
export const COLOURS = 6;
export const SIZE = 8;
const CELLS = SIZE * SIZE;

export type Puzzle = {
  id: string;
  /** the opening board, already free of matches and with a move available */
  board: Fruit[];
  /** how many swaps you get */
  moves: number;
  /** what a good game scores here — measured, not chosen */
  target: number;
  tier: "gentle" | "steady" | "tricky";
};

export type State = {
  board: Fruit[];
  /** how far into the refill stream we are; part of the state, so a replay is exact */
  drawn: number;
  moves: number;
  score: number;
  /** how many times the board had to be shaken out for want of a legal move */
  shuffles: number;
};

export type Saved = { board: Fruit[]; drawn: number; moves: number; score: number; shuffles: number };

/* ── the seeded stream ────────────────────────────────────────────────────── */

/**
 * mulberry32, but indexed rather than stepped.
 *
 * Every other generator here keeps a running PRNG; this one is asked for "the
 * nth number" instead. That is what makes `drawn` a complete description of
 * where the stream has got to — a save is five numbers and an array, and it
 * restores to exactly the board you left, including what would fall next.
 */
function at(seed: number, n: number): number {
  let a = (seed + n * 0x9e3779b9) >>> 0;
  a = (a + 0x6d2b79f5) >>> 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const drawFruit = (seed: number, n: number): Fruit => Math.floor(at(seed, n) * COLOURS);

/* ── the board ────────────────────────────────────────────────────────────── */

export const xOf = (i: number) => i % SIZE;
export const yOf = (i: number) => Math.floor(i / SIZE);
export const idx = (x: number, y: number) => y * SIZE + x;

export const adjacent = (a: number, b: number) =>
  (Math.abs(xOf(a) - xOf(b)) === 1 && yOf(a) === yOf(b)) ||
  (Math.abs(yOf(a) - yOf(b)) === 1 && xOf(a) === xOf(b));

/**
 * Every cell that is part of a run of three or more, across or down.
 *
 * Returned as a set rather than a list of runs: a cell can sit in a horizontal
 * and a vertical run at once, and clearing it twice would pay for it twice.
 */
export function matches(board: Fruit[]): Set<number> {
  const hit = new Set<number>();

  for (let y = 0; y < SIZE; y++) {
    let run = 1;
    for (let x = 1; x <= SIZE; x++) {
      const same = x < SIZE && board[idx(x, y)] === board[idx(x - 1, y)] && board[idx(x, y)] >= 0;
      if (same) { run++; continue; }
      if (run >= 3) for (let k = x - run; k < x; k++) hit.add(idx(k, y));
      run = 1;
    }
  }
  for (let x = 0; x < SIZE; x++) {
    let run = 1;
    for (let y = 1; y <= SIZE; y++) {
      const same = y < SIZE && board[idx(x, y)] === board[idx(x, y - 1)] && board[idx(x, y)] >= 0;
      if (same) { run++; continue; }
      if (run >= 3) for (let k = y - run; k < y; k++) hit.add(idx(x, k));
      run = 1;
    }
  }
  return hit;
}

/** Would swapping these two make anything? The only test for a legal move. */
export function wouldMatch(board: Fruit[], a: number, b: number): boolean {
  if (!adjacent(a, b)) return false;
  const next = board.slice();
  [next[a], next[b]] = [next[b], next[a]];
  return matches(next).size > 0;
}

/** Every swap worth making. Empty means the board is dead and needs shaking. */
export function legalMoves(board: Fruit[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < CELLS; i++) {
    const x = xOf(i), y = yOf(i);
    if (x < SIZE - 1 && wouldMatch(board, i, i + 1)) out.push([i, i + 1]);
    if (y < SIZE - 1 && wouldMatch(board, i, i + SIZE)) out.push([i, i + SIZE]);
  }
  return out;
}

/* ── what a move does ─────────────────────────────────────────────────────── */

/**
 * One beat of a cascade, for the board to animate.
 *
 * The engine resolves a whole move at once and hands back the beats, the same
 * shape Smallholding's night uses: the outcome is settled before anything is
 * drawn, so playback cannot change it and a dropped frame cannot desync it.
 */
export type Beat = {
  /** cells clearing on this beat */
  cleared: number[];
  /** the board after they have gone and everything has fallen */
  board: Fruit[];
  /** what this beat paid */
  gained: number;
  /** 1 for the swap itself, 2 for the first cascade, and so on */
  depth: number;
};

export type Move = { beats: Beat[]; gained: number; state: State };

/**
 * What a clear pays.
 *
 * Longer runs pay more than their length — a five costs the same one swap a
 * three does, and should be worth reaching for. Cascades pay more again,
 * because they are the thing you can actually plan: setting up a fall you
 * cannot see the end of is the skill this game has.
 */
export const scoreFor = (cleared: number, depth: number) =>
  Math.round(cleared * 10 * (1 + (cleared - 3) * 0.35) * (1 + (depth - 1) * 0.5));

/** Drop everything into the holes and top up from the stream. */
function settle(board: Fruit[], seed: number, drawn: number): { board: Fruit[]; drawn: number } {
  const next = board.slice();
  let n = drawn;
  for (let x = 0; x < SIZE; x++) {
    // walk up the column, packing what survives to the bottom
    let write = SIZE - 1;
    for (let y = SIZE - 1; y >= 0; y--) {
      const v = next[idx(x, y)];
      if (v >= 0) { next[idx(x, write)] = v; write--; }
    }
    // and fill the rest from the stream, top-most cell drawn last
    for (let y = write; y >= 0; y--) next[idx(x, y)] = drawFruit(seed, n++);
  }
  return { board: next, drawn: n };
}

/**
 * Shake the board out when there is nothing left to do.
 *
 * Deterministic, and it keeps drawing until the result both has a move and has
 * no free matches sitting in it. A board with no legal move is not a hard
 * puzzle, it is a broken one, and leaving the player to notice is worse than
 * quietly dealing again.
 */
export function shuffle(board: Fruit[], seed: number, drawn: number): { board: Fruit[]; drawn: number } {
  let n = drawn;
  for (let tries = 0; tries < 200; tries++) {
    const next = board.slice();
    // Fisher-Yates from the stream, so the same board always shakes the same way
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(at(seed, n++) * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    if (matches(next).size === 0 && legalMoves(next).length > 0) return { board: next, drawn: n };
  }
  return { board, drawn: n };
}

export function initialState(puzzle: Puzzle, restored?: Saved): State {
  const fresh: State = {
    board: puzzle.board.slice(),
    drawn: 0,
    moves: puzzle.moves,
    score: 0,
    shuffles: 0,
  };
  if (!restored?.board || restored.board.length !== CELLS) return fresh;
  if (!restored.board.every((v) => Number.isInteger(v) && v >= 0 && v < COLOURS)) return fresh;
  return {
    board: restored.board.slice(),
    drawn: Math.max(0, restored.drawn | 0),
    moves: Math.min(puzzle.moves, Math.max(0, restored.moves | 0)),
    score: Math.max(0, restored.score | 0),
    shuffles: Math.max(0, restored.shuffles | 0),
  };
}

export const toSave = (s: State): Saved => ({
  board: s.board,
  drawn: s.drawn,
  moves: s.moves,
  score: s.score,
  shuffles: s.shuffles,
});

/**
 * Make a swap and resolve everything it causes.
 *
 * Returns the same state when the swap is not allowed, so a caller can compare
 * by identity to know the tap did nothing — the convention every engine here
 * follows.
 */
export function swap(puzzle: Puzzle, s: State, seed: number, a: number, b: number): Move | null {
  if (s.moves <= 0) return null;
  if (!wouldMatch(s.board, a, b)) return null;

  const board = s.board.slice();
  [board[a], board[b]] = [board[b], board[a]];

  const beats: Beat[] = [];
  let drawn = s.drawn;
  let gained = 0;
  let working = board;
  let depth = 1;

  for (;;) {
    const hit = matches(working);
    if (hit.size === 0) break;
    const paid = scoreFor(hit.size, depth);
    gained += paid;

    const holed = working.slice();
    for (const i of hit) holed[i] = -1;
    const fell = settle(holed, seed, drawn);
    drawn = fell.drawn;
    working = fell.board;

    beats.push({ cleared: [...hit], board: working.slice(), gained: paid, depth });
    depth++;
  }

  let shuffles = s.shuffles;
  if (legalMoves(working).length === 0) {
    const shaken = shuffle(working, seed, drawn);
    working = shaken.board;
    drawn = shaken.drawn;
    shuffles++;
    beats.push({ cleared: [], board: working.slice(), gained: 0, depth: 0 });
  }

  return {
    beats,
    gained,
    state: {
      board: working,
      drawn,
      moves: s.moves - 1,
      score: s.score + gained,
      shuffles,
    },
  };
}

export const isOver = (s: State) => s.moves <= 0;
export const beat = (puzzle: Puzzle, s: State) => s.score >= puzzle.target;

/* ── dealing a board ──────────────────────────────────────────────────────── */

/**
 * A board with nothing already matching and at least one move to make.
 *
 * Free matches at the start are the same bug as a dead board: one hands out
 * points nobody earned, the other hands out a puzzle nobody can play.
 */
export function deal(seed: number): { board: Fruit[]; drawn: number } {
  let n = 0;
  for (let tries = 0; tries < 400; tries++) {
    const board: Fruit[] = [];
    for (let i = 0; i < CELLS; i++) board.push(drawFruit(seed, n++));
    if (matches(board).size > 0) continue;
    if (legalMoves(board).length === 0) continue;
    return { board, drawn: n };
  }
  // a fallback that is still a real board rather than a throw
  const board: Fruit[] = [];
  for (let i = 0; i < CELLS; i++) board.push(i % COLOURS);
  return shuffle(board, seed, n);
}
