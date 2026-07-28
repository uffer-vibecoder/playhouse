/**
 * Block Out! — drop pieces on a grid, clear full rows and columns, keep going
 * until nothing fits.
 *
 * Zero imports, like every engine here.
 *
 * ── What this is, and what it is not ────────────────────────────────────────
 *
 * Every other game on this site is a puzzle: it has an answer, the answer is
 * proved before it ships, and finishing is the point. This one is not. It is
 * endless and score-driven, it ends when you are stuck rather than when you are
 * done, and there is nothing to prove about a board because the board is
 * whatever you have made of it.
 *
 * That was worth arguing about and the argument is settled — this is the game
 * Noah asked for, built as the game rather than reshaped into something it is
 * not. What survives of the objection is one thing that costs nothing and helps:
 * **the pieces come from a seed.** A run is reproducible, so "I got 4,200 on run
 * 31" is a claim someone else can go and test rather than a story.
 *
 * ── The board ───────────────────────────────────────────────────────────────
 *
 * Eight by eight, held as a flat array of 64. Pieces are offered three at a
 * time and never rotate — placing them as drawn is the genre's whole tension,
 * and a rotate button quietly removes most of the difficulty.
 */

export const SIZE = 8;
export const CELLS = SIZE * SIZE;
export const TRAY = 3;

/** A piece is its filled cells, relative to its own top-left. */
export type Shape = { name: string; cells: [number, number][]; w: number; h: number };

const shape = (name: string, rows: string[]): Shape => {
  const cells: [number, number][] = [];
  rows.forEach((row, y) => [...row].forEach((c, x) => c === "#" && cells.push([x, y])));
  return { name, cells, w: Math.max(...rows.map((r) => r.length)), h: rows.length };
};

/**
 * The bag.
 *
 * Weighted by how forgiving each piece is, not uniformly: a 3×3 square is the
 * piece that ends runs, and drawing three of them at once should be rare rather
 * than merely unlucky. Small pieces are common because a game where you cannot
 * tidy up is not difficult, it is arbitrary.
 */
export const SHAPES: { shape: Shape; weight: number }[] = [
  { shape: shape("dot", ["#"]), weight: 6 },
  { shape: shape("pair", ["##"]), weight: 7 },
  { shape: shape("pair up", ["#", "#"]), weight: 7 },
  { shape: shape("three", ["###"]), weight: 7 },
  { shape: shape("three up", ["#", "#", "#"]), weight: 7 },
  { shape: shape("four", ["####"]), weight: 5 },
  { shape: shape("four up", ["#", "#", "#", "#"]), weight: 5 },
  { shape: shape("five", ["#####"]), weight: 2 },
  { shape: shape("five up", ["#", "#", "#", "#", "#"]), weight: 2 },
  { shape: shape("square", ["##", "##"]), weight: 6 },
  { shape: shape("corner", ["##", "#."]), weight: 4 },
  { shape: shape("corner b", ["##", ".#"]), weight: 4 },
  { shape: shape("corner c", ["#.", "##"]), weight: 4 },
  { shape: shape("corner d", [".#", "##"]), weight: 4 },
  { shape: shape("ell", ["#.", "#.", "##"]), weight: 3 },
  { shape: shape("ell b", [".#", ".#", "##"]), weight: 3 },
  { shape: shape("tee", ["###", ".#."]), weight: 3 },
  { shape: shape("ess", [".##", "##."]), weight: 2 },
  { shape: shape("zee", ["##.", ".##"]), weight: 2 },
  { shape: shape("big square", ["###", "###", "###"]), weight: 1 },
];

export type Piece = { shapeIndex: number; used: boolean };

export type State = {
  /**
   * The run's seed, carried on the state.
   *
   * A first draft kept this in a module-level variable so `place` could reach
   * it. That is a global by another name: two boards on one page would share
   * it, and a server render would leave whatever the last caller set. One state
   * in, one state out — the same rule every engine here follows.
   */
  seed: number;
  /** 64 cells; 0 empty, otherwise the hue index of the piece that filled it */
  grid: number[];
  tray: Piece[];
  score: number;
  /** consecutive placements that cleared something, for the combo */
  streak: number;
  /** how many placements have been made, which is what drives the piece supply */
  placed: number;
  over: boolean;
  /** cells cleared by the last placement, for the board to animate */
  lastCleared: number[];
};

export type Saved = { grid: number[]; tray: number[]; score: number; streak: number; placed: number };

/* ── the supply ───────────────────────────────────────────────────────────── */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TOTAL_WEIGHT = SHAPES.reduce((n, s) => n + s.weight, 0);

/**
 * The nth piece of a run.
 *
 * A pure function of the seed and the draw number rather than a running
 * generator, so the supply can be recomputed from a save without storing it —
 * and so replaying a run really does deal the same pieces in the same order.
 */
export function pieceAt(seed: number, n: number): number {
  const rand = rng(seed + n * 7919);
  let roll = rand() * TOTAL_WEIGHT;
  for (let i = 0; i < SHAPES.length; i++) {
    roll -= SHAPES[i].weight;
    if (roll <= 0) return i;
  }
  return 0;
}

export function initialState(seed: number, restored?: Saved): State {
  if (restored?.grid?.length === CELLS) {
    const grid = restored.grid.slice();
    const tray = restored.tray.map((shapeIndex) => ({ shapeIndex, used: false }));
    return {
      seed,
      grid,
      tray,
      score: restored.score,
      streak: restored.streak,
      placed: restored.placed,
      // Worked out again on restore rather than assumed false. A run that ended
      // and was then reloaded would otherwise come back looking playable, with
      // three pieces on offer and nowhere on the board to put any of them.
      over: !tray.some((p) => fitsAnywhere(grid, SHAPES[p.shapeIndex].shape)),
      lastCleared: [],
    };
  }
  return {
    seed,
    grid: Array(CELLS).fill(0),
    tray: Array.from({ length: TRAY }, (_, i) => ({ shapeIndex: pieceAt(seed, i), used: false })),
    score: 0,
    streak: 0,
    placed: 0,
    over: false,
    lastCleared: [],
  };
}

export const toSave = (s: State): Saved => ({
  grid: s.grid,
  tray: s.tray.filter((p) => !p.used).map((p) => p.shapeIndex),
  score: s.score,
  streak: s.streak,
  placed: s.placed,
});

/* ── placing ──────────────────────────────────────────────────────────────── */

export const at = (x: number, y: number) => y * SIZE + x;

/** Can this shape sit with its top-left at (x, y)? */
export function fits(grid: number[], shape: Shape, x: number, y: number): boolean {
  for (const [dx, dy] of shape.cells) {
    const cx = x + dx;
    const cy = y + dy;
    if (cx < 0 || cy < 0 || cx >= SIZE || cy >= SIZE) return false;
    if (grid[at(cx, cy)]) return false;
  }
  return true;
}

/** Anywhere at all? This is what decides whether a run is over. */
export function fitsAnywhere(grid: number[], shape: Shape): boolean {
  for (let y = 0; y <= SIZE - shape.h; y++)
    for (let x = 0; x <= SIZE - shape.w; x++) if (fits(grid, shape, x, y)) return true;
  return false;
}

/**
 * Rows and columns that are full.
 *
 * Gathered before anything is removed, because clearing a row can complete a
 * column and vice versa — taking them one at a time would score the second one
 * against a board the first had already emptied.
 */
export function fullLines(grid: number[]): { rows: number[]; cols: number[] } {
  const rows: number[] = [];
  const cols: number[] = [];
  for (let y = 0; y < SIZE; y++) {
    let full = true;
    for (let x = 0; x < SIZE; x++) if (!grid[at(x, y)]) { full = false; break; }
    if (full) rows.push(y);
  }
  for (let x = 0; x < SIZE; x++) {
    let full = true;
    for (let y = 0; y < SIZE; y++) if (!grid[at(x, y)]) { full = false; break; }
    if (full) cols.push(x);
  }
  return { rows, cols };
}

/**
 * Place a piece and settle everything that follows.
 *
 * Scoring, in order: a point per cell laid down, then ten per line cleared with
 * a bonus that grows as lines clear together, then the streak for clearing on
 * consecutive turns. Clearing two lines at once is worth more than clearing one
 * twice — which is the whole reason to build up rather than tidy constantly.
 *
 * Returns the same state when the placement is illegal, so callers can compare
 * by identity rather than being told with an exception.
 */
export function place(s: State, trayIndex: number, x: number, y: number): State {
  const piece = s.tray[trayIndex];
  if (!piece || piece.used || s.over) return s;
  const shape = SHAPES[piece.shapeIndex].shape;
  if (!fits(s.grid, shape, x, y)) return s;

  const grid = s.grid.slice();
  const hue = (piece.shapeIndex % 4) + 1;
  for (const [dx, dy] of shape.cells) grid[at(x + dx, y + dy)] = hue;

  const { rows, cols } = fullLines(grid);
  const cleared: number[] = [];
  for (const yy of rows) for (let xx = 0; xx < SIZE; xx++) cleared.push(at(xx, yy));
  for (const xx of cols) for (let yy = 0; yy < SIZE; yy++) cleared.push(at(xx, yy));
  for (const i of cleared) grid[i] = 0;

  const lines = rows.length + cols.length;
  const streak = lines ? s.streak + 1 : 0;
  // 10 a line, +10 for each line beyond the first cleared together, and the
  // streak on top — all of it rewards setting up rather than nibbling
  const lineScore = lines ? lines * 10 + (lines - 1) * 10 + (streak - 1) * 5 : 0;
  const score = s.score + shape.cells.length + lineScore;

  const tray = s.tray.map((p, i) => (i === trayIndex ? { ...p, used: true } : p));
  const placed = s.placed + 1;

  // a fresh three only once all three have gone: refilling one at a time turns
  // the game into a slot machine rather than a plan
  const refilled = tray.every((p) => p.used)
    ? Array.from({ length: TRAY }, (_, i) => ({
        shapeIndex: pieceAt(s.seed, placed + i),
        used: false,
      }))
    : tray;

  const over = !refilled.some((p) => !p.used && fitsAnywhere(grid, SHAPES[p.shapeIndex].shape));

  return { seed: s.seed, grid, tray: refilled, score, streak, placed, over, lastCleared: cleared };
}

export const isOver = (s: State) => s.over;

/** Every square a piece would cover from here — for the board's hover preview. */
export function footprint(shape: Shape, x: number, y: number): number[] {
  return shape.cells
    .map(([dx, dy]) => [x + dx, y + dy])
    .filter(([cx, cy]) => cx >= 0 && cy >= 0 && cx < SIZE && cy < SIZE)
    .map(([cx, cy]) => at(cx, cy));
}

/**
 * Which lines *would* clear if this piece went here.
 *
 * The board shows this before you commit, because the difference between a good
 * placement and a wasted one is often invisible until it is too late to take
 * back — and there is no undo in a game that ends when you are stuck.
 */
export function wouldClear(grid: number[], shape: Shape, x: number, y: number): number[] {
  if (!fits(grid, shape, x, y)) return [];
  const test = grid.slice();
  for (const [dx, dy] of shape.cells) test[at(x + dx, y + dy)] = 1;
  const { rows, cols } = fullLines(test);
  const out: number[] = [];
  for (const yy of rows) for (let xx = 0; xx < SIZE; xx++) out.push(at(xx, yy));
  for (const xx of cols) for (let yy = 0; yy < SIZE; yy++) out.push(at(xx, yy));
  return out;
}
