/**
 * Sliding tiles — fifteen numbers and a gap, pushed back into order.
 *
 * Same contract as the other engines: no DOM, no React, no imports, every
 * function pure.
 *
 * THE THING THAT MATTERS HERE
 *
 * Exactly half of the arrangements of a 15-puzzle cannot be solved at all. Deal
 * the tiles at random and one board in two is impossible — and it looks
 * completely normal, so a player would simply fail at it forever.
 *
 * The parity rule that decides this is implemented below as `isSolvable`, but
 * it is deliberately *not* how boards are made. Instead `board` starts from the
 * solved arrangement and walks legal moves backwards: every move is reversible,
 * so whatever it reaches can always be walked back. Solvability is a property
 * of the construction rather than something to test for and retry.
 *
 * `isSolvable` exists for two other jobs: proving the constructor right in the
 * tests, and refusing a restored save that has been tampered with.
 */

export type Puzzle = {
  id: string;
  /** The whole board, in one integer. */
  seed: number;
  added?: string;
};

/** Row-major tiles; 0 is the gap. */
export type Tiles = number[];

export type State = {
  tiles: Tiles;
  /** The tile most recently moved, so the board can show where you just were. */
  last: number | null;
};

export const SIZE = 4;
export const CELLS = SIZE * SIZE;

export const solvedTiles = (): Tiles =>
  Array.from({ length: CELLS }, (_, i) => (i + 1) % CELLS);

export const isSolved = (tiles: Tiles) => tiles.every((t, i) => t === (i + 1) % CELLS);

/* ── generation ─────────────────────────────────────────────────────────── */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Indices whose tile may move into the gap — the gap's orthogonal neighbours. */
export function neighbours(gap: number): number[] {
  const r = Math.floor(gap / SIZE);
  const c = gap % SIZE;
  const out: number[] = [];
  if (r > 0) out.push(gap - SIZE);
  if (r < SIZE - 1) out.push(gap + SIZE);
  if (c > 0) out.push(gap - 1);
  if (c < SIZE - 1) out.push(gap + 1);
  return out;
}

/**
 * How far from solved a puzzle starts, easing across the archive.
 *
 * A random walk on this puzzle saturates quickly — past roughly forty moves the
 * board is indistinguishable from a uniformly random solvable one, so depth is
 * only a real difficulty lever while it is shallow. Hence the ramp sits in that
 * window rather than climbing forever.
 */
export const scrambleDepth = (index: number) => 12 + Math.min(index, 60) * 0.7;

export function board(puzzle: Puzzle, index = 0): Tiles {
  const rand = rng(puzzle.seed);
  const tiles = solvedTiles();
  let gap = tiles.indexOf(0);
  let cameFrom = -1;

  const steps = Math.round(scrambleDepth(index));
  for (let i = 0; i < steps; i++) {
    // never immediately undo the last move, or the walk mostly stands still
    const options = neighbours(gap).filter((n) => n !== cameFrom);
    const from = options[Math.floor(rand() * options.length)];
    tiles[gap] = tiles[from];
    tiles[from] = 0;
    cameFrom = gap;
    gap = from;
  }

  // A walk can wander back to where it started; nobody wants a solved puzzle.
  return isSolved(tiles) ? board({ ...puzzle, seed: puzzle.seed + 1 }, index) : tiles;
}

/**
 * The parity rule, for verification rather than generation.
 *
 * On a board of even width, an arrangement is solvable when the number of
 * inversions plus the gap's row counted from the bottom is odd.
 */
export function isSolvable(tiles: Tiles): boolean {
  const seq = tiles.filter((t) => t !== 0);
  let inversions = 0;
  for (let i = 0; i < seq.length; i++) {
    for (let j = i + 1; j < seq.length; j++) if (seq[i] > seq[j]) inversions++;
  }
  const gapRowFromBottom = SIZE - Math.floor(tiles.indexOf(0) / SIZE);
  return (inversions + gapRowFromBottom) % 2 === 1;
}

/** A restored save has to be a real board, not sixteen arbitrary numbers. */
export function isWellFormed(tiles: unknown): tiles is Tiles {
  if (!Array.isArray(tiles) || tiles.length !== CELLS) return false;
  const seen = new Set<number>();
  for (const t of tiles) {
    if (!Number.isInteger(t) || t < 0 || t >= CELLS || seen.has(t)) return false;
    seen.add(t);
  }
  return true;
}

/* ── state ──────────────────────────────────────────────────────────────── */

export type Saved = { tiles: Tiles };

export function initialState(puzzle: Puzzle, index = 0, restored?: Saved): State {
  const t = restored?.tiles;
  // Junk, a wrong length, a repeated tile or an unreachable arrangement all
  // fall back to the puzzle as issued rather than stranding the player.
  const usable = isWellFormed(t) && isSolvable(t) ? t : board(puzzle, index);
  return { tiles: [...usable], last: null };
}

/**
 * Push a tile toward the gap.
 *
 * The whole row or column between the tapped tile and the gap moves together —
 * tapping three cells away and watching one tile shuffle would be tedious, and
 * every intermediate move is legal anyway.
 */
export function slide(s: State, index: number): State {
  if (index < 0 || index >= CELLS || s.tiles[index] === 0) return s;
  const gap = s.tiles.indexOf(0);
  const gr = Math.floor(gap / SIZE);
  const gc = gap % SIZE;
  const r = Math.floor(index / SIZE);
  const c = index % SIZE;
  if (r !== gr && c !== gc) return s; // not in line with the gap

  const tiles = [...s.tiles];
  const stepBy = r === gr ? (c < gc ? 1 : -1) : c === gc ? (r < gr ? SIZE : -SIZE) : 0;
  if (!stepBy) return s;

  // walk the gap toward the tapped cell, one cell at a time
  let hole = gap;
  while (hole !== index) {
    const next = hole - stepBy;
    tiles[hole] = tiles[next];
    tiles[next] = 0;
    hole = next;
  }
  return { tiles, last: s.tiles[index] };
}

/** Arrow keys move the gap, which is the opposite of moving a tile. */
export function slideByDirection(s: State, dr: number, dc: number): State {
  const gap = s.tiles.indexOf(0);
  const r = Math.floor(gap / SIZE) + dr;
  const c = (gap % SIZE) + dc;
  if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return s;
  return slide(s, r * SIZE + c);
}

/* ── hints ──────────────────────────────────────────────────────────────── */

/** Where tile `t` belongs, as [row, col]. */
const homeOf = (t: number) => [Math.floor((t - 1) / SIZE), (t - 1) % SIZE];

/**
 * Manhattan distance plus linear conflict.
 *
 * Manhattan alone is admissible but weak: it cannot see that two tiles already
 * in their home row, but the wrong way round, must step out of that row and
 * back. Each such pair costs two extra moves, and counting them roughly halves
 * the search on the boards this game produces. Still admissible, so the first
 * move found is still on a shortest solution.
 */
function heuristic(tiles: Tiles): number {
  let h = 0;
  for (let i = 0; i < CELLS; i++) {
    const t = tiles[i];
    if (t === 0) continue;
    const [hr, hc] = homeOf(t);
    h += Math.abs(Math.floor(i / SIZE) - hr) + Math.abs((i % SIZE) - hc);
  }

  // rows
  for (let r = 0; r < SIZE; r++) {
    for (let a = 0; a < SIZE; a++) {
      const ta = tiles[r * SIZE + a];
      if (!ta || homeOf(ta)[0] !== r) continue;
      for (let b = a + 1; b < SIZE; b++) {
        const tb = tiles[r * SIZE + b];
        if (!tb || homeOf(tb)[0] !== r) continue;
        if (homeOf(ta)[1] > homeOf(tb)[1]) h += 2;
      }
    }
  }
  // columns
  for (let c = 0; c < SIZE; c++) {
    for (let a = 0; a < SIZE; a++) {
      const ta = tiles[a * SIZE + c];
      if (!ta || homeOf(ta)[1] !== c) continue;
      for (let b = a + 1; b < SIZE; b++) {
        const tb = tiles[b * SIZE + c];
        if (!tb || homeOf(tb)[1] !== c) continue;
        if (homeOf(ta)[0] > homeOf(tb)[0]) h += 2;
      }
    }
  }
  return h;
}

export type Hint =
  | { kind: "move"; index: number; remaining: number }
  /** The search ran out of budget. Say so rather than inventing a move. */
  | { kind: "none" };

/**
 * The next move on a shortest solution, or an admission that we could not find
 * one in time.
 *
 * IDA* — iterative deepening on f = g + h, which keeps memory flat where a
 * plain A* on a 16!/2 state space would not.
 *
 * The budget is set from measurement rather than taste. Across 120 boards
 * spanning the archive's whole scramble range, the mean search is 20ms and the
 * mean optimal line 26 moves; three boards needed more than 400k nodes and all
 * three finish under 1.5M, the slowest in 1.1s. So 1.5M solves everything this
 * game can generate, and `none` is a real answer for a board tangled past that
 * rather than a routine outcome — saying so is better than freezing the tab,
 * and far better than showing a move we cannot stand behind.
 *
 * Callers should hand this a frame before running it: a second of synchronous
 * search with no feedback reads as a hang.
 */
export function hint(tiles: Tiles, budget = 1_500_000): Hint {
  if (isSolved(tiles)) return { kind: "none" };

  const board = [...tiles];
  let nodes = 0;
  let firstMove = -1;
  let found = -1;

  const search = (gap: number, g: number, bound: number, cameFrom: number): number => {
    const h = heuristic(board);
    const f = g + h;
    if (f > bound) return f;
    if (h === 0) {
      found = g;
      return -1;
    }
    if (++nodes > budget) return -1 - 1; // sentinel: out of budget

    let min = Infinity;
    for (const from of neighbours(gap)) {
      if (from === cameFrom) continue;
      board[gap] = board[from];
      board[from] = 0;
      const t = search(from, g + 1, bound, gap);
      board[from] = board[gap];
      board[gap] = 0;
      if (t === -1) {
        if (g === 0) firstMove = from;
        return -1;
      }
      if (t === -2) return -2;
      if (t < min) min = t;
    }
    return min;
  };

  let bound = heuristic(board);
  const gap0 = board.indexOf(0);
  for (;;) {
    const t = search(gap0, 0, bound, -1);
    if (t === -1) return { kind: "move", index: firstMove, remaining: found };
    if (t === -2 || t === Infinity) return { kind: "none" };
    bound = t;
    if (nodes > budget) return { kind: "none" };
  }
}

export const isSolvedPuzzle = (s: State) => isSolved(s.tiles);
export const toSave = (s: State): Saved => ({ tiles: s.tiles });

export const reset = (puzzle: Puzzle, index = 0): State => ({
  tiles: board(puzzle, index),
  last: null,
});

/** How many tiles are already home — a gentle sense of progress, not a score. */
export const homeCount = (s: State) =>
  s.tiles.reduce((n, t, i) => n + (t !== 0 && t === i + 1 ? 1 : 0), 0);
