/**
 * Colour Blocks — coloured rectangles slide on a grid and leave through gates
 * that match them.
 *
 * Zero imports, like every engine here: it has to run in the browser, in the
 * generator script and in the test suite, and the only way that stays true is
 * to depend on nothing.
 *
 * ── What makes this fit ─────────────────────────────────────────────────────
 *
 * The state is a handful of block positions, so a save stays tiny, and the
 * state space is small enough to search exhaustively — which means the
 * generator can *prove* a board solvable and compute its shortest solution
 * before shipping it.
 *
 * That does change the invariant. Every other game here ships puzzles with
 * exactly one solution; this one has many paths, so the guarantee becomes
 * **the shortest solution is exactly `par` moves**. Finishing is not the only
 * axis any more — finishing in par is.
 *
 * ── Colour is never the only signal ─────────────────────────────────────────
 *
 * A game about matching colours is the obvious place to fail someone with
 * colour blindness, and the word game already set the rule here: states are
 * told apart by more than hue. So every colour carries a **shape** as well,
 * drawn on both the block and its gate. Play it in greyscale and it still
 * works — that is the test, not a preference.
 */

export type Dir = "up" | "down" | "left" | "right";
export type Edge = "top" | "bottom" | "left" | "right";

/** The four families. `shape` is what makes the game legible without hue. */
export const HUES = ["rose", "sage", "sky", "sand"] as const;
export type Hue = (typeof HUES)[number];
export const SHAPE: Record<Hue, string> = {
  rose: "●",
  sage: "▲",
  sky: "■",
  sand: "◆",
};

export type Block = {
  id: number;
  /** top-left cell */
  x: number;
  y: number;
  w: number;
  h: number;
  hue: Hue;
};

/**
 * A doorway in the wall. `at` is where it starts along that edge and `len` how
 * many cells it spans — a block leaves only if its whole cross-section fits
 * inside, which is what stops a 3-wide block escaping through a 1-wide gap.
 */
export type Gate = { edge: Edge; at: number; len: number; hue: Hue };

export type Puzzle = {
  id: string;
  w: number;
  h: number;
  blocks: Block[];
  gates: Gate[];
  /** the shortest solution, in moves — proved by the generator, not estimated */
  par: number;
};

export type State = {
  blocks: Block[];
  moves: number;
  /** positions before each move, so undo is exact rather than reconstructed */
  past: Block[][];
};

/** What a save holds: where the blocks are and how many moves it took. */
export type Saved = { blocks: Block[]; moves: number };

export const DIRS: Dir[] = ["up", "down", "left", "right"];

const STEP: Record<Dir, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

/** Which wall you are heading for. */
const EDGE_OF: Record<Dir, Edge> = {
  up: "top",
  down: "bottom",
  left: "left",
  right: "right",
};

export function initialState(puzzle: Puzzle, restored?: Saved): State {
  const blocks = restored?.blocks?.length
    ? restored.blocks.map((b) => ({ ...b }))
    : puzzle.blocks.map((b) => ({ ...b }));
  return { blocks, moves: restored?.moves ?? 0, past: [] };
}

export const toSave = (s: State): Saved => ({ blocks: s.blocks, moves: s.moves });

const overlaps = (a: Block, b: Block) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Every cell a block would occupy at an offset, still on the board? */
function insideBoard(b: Block, w: number, h: number) {
  return b.x >= 0 && b.y >= 0 && b.x + b.w <= w && b.y + b.h <= h;
}

/**
 * Can this block leave through a wall it is pressed against?
 *
 * Two conditions, and the second is the one that makes the puzzle a puzzle: the
 * gate has to be the right colour *and* wide enough for the whole block. A tall
 * block cannot squeeze through a one-cell door.
 */
export function exitsThrough(puzzle: Puzzle, b: Block, dir: Dir): boolean {
  const edge = EDGE_OF[dir];
  for (const g of puzzle.gates) {
    if (g.edge !== edge || g.hue !== b.hue) continue;
    // along the edge, the block spans [from, to)
    const from = edge === "top" || edge === "bottom" ? b.x : b.y;
    const to = from + (edge === "top" || edge === "bottom" ? b.w : b.h);
    if (from >= g.at && to <= g.at + g.len) return true;
  }
  return false;
}

/** Is the block flush against the wall it would leave by? */
function atWall(puzzle: Puzzle, b: Block, dir: Dir): boolean {
  if (dir === "up") return b.y === 0;
  if (dir === "down") return b.y + b.h === puzzle.h;
  if (dir === "left") return b.x === 0;
  return b.x + b.w === puzzle.w;
}

/**
 * How far this block can travel in one direction, and whether carrying on takes
 * it off the board.
 *
 * A move is one block, one direction, any distance — the Rush Hour convention.
 * Counting each cell separately would make par a distance rather than a count
 * of decisions, and the decisions are the game.
 */
export function reach(puzzle: Puzzle, blocks: Block[], id: number, dir: Dir): {
  max: number;
  canExit: boolean;
} {
  const me = blocks.find((b) => b.id === id)!;
  const others = blocks.filter((b) => b.id !== id);
  const [dx, dy] = STEP[dir];

  let max = 0;
  for (let d = 1; d <= Math.max(puzzle.w, puzzle.h); d++) {
    const moved = { ...me, x: me.x + dx * d, y: me.y + dy * d };
    if (!insideBoard(moved, puzzle.w, puzzle.h)) break;
    if (others.some((o) => overlaps(moved, o))) break;
    max = d;
  }

  const parked = { ...me, x: me.x + dx * max, y: me.y + dy * max };
  // It can only leave if nothing stopped it short of the wall, and the wall has
  // the right door.
  const canExit = atWall(puzzle, parked, dir) && exitsThrough(puzzle, parked, dir);
  return { max, canExit };
}

/**
 * Slide a block. `distance` of `Infinity` means "as far as it goes", and if
 * that reaches a matching gate the block leaves the board entirely.
 *
 * Returns the same state when nothing would happen, so callers can compare by
 * identity to know whether a move was legal — no exceptions for a tap on a
 * block that cannot move.
 */
export function slide(puzzle: Puzzle, s: State, id: number, dir: Dir, distance = Infinity): State {
  const { max, canExit } = reach(puzzle, s.blocks, id, dir);
  if (max === 0) return s;

  const d = Math.min(distance, max);
  if (d <= 0) return s;

  const leaving = canExit && d === max;
  const [dx, dy] = STEP[dir];
  const past = [...s.past, s.blocks.map((b) => ({ ...b }))];

  const blocks = leaving
    ? s.blocks.filter((b) => b.id !== id)
    : s.blocks.map((b) => (b.id === id ? { ...b, x: b.x + dx * d, y: b.y + dy * d } : b));

  return { blocks, moves: s.moves + 1, past };
}

export function undo(s: State): State {
  if (!s.past.length) return s;
  const past = s.past.slice(0, -1);
  return { blocks: s.past[s.past.length - 1], moves: s.moves - 1, past };
}

export const isSolved = (s: State) => s.blocks.length === 0;

/** Board cleared, and in no more moves than the shortest solution. */
export const isPerfect = (puzzle: Puzzle, s: State) => isSolved(s) && s.moves <= puzzle.par;

/* ── proving a board ───────────────────────────────────────────────────────── */

/**
 * A state's identity, for the search's visited set.
 *
 * Block id is deliberately *not* in the key. Two blocks of the same colour and
 * size are interchangeable — a position reached by swapping which one went
 * where is the same position — and folding those together is most of what keeps
 * the search small.
 */
export function encode(blocks: Block[]): string {
  // Packed into a small integer per block rather than a template string. This
  // runs once per successor — hundreds of thousands of times in a single solve
  // — and building strings only to sort them was most of the generator's
  // runtime. Boards are at most 6×6 with blocks no longer than 3, so every
  // field fits in a few bits with room to spare.
  const n = blocks.length;
  const packed: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const b = blocks[i];
    packed[i] = ((((HUE_INDEX[b.hue] * 4 + b.w) * 4 + b.h) * 8 + b.y) * 8 + b.x);
  }
  packed.sort((a, b) => a - b);
  return packed.join(",");
}

const HUE_INDEX: Record<Hue, number> = { rose: 0, sage: 1, sky: 2, sand: 3 };

/**
 * Which cells are taken, as a flat grid.
 *
 * The search asks "is this cell free" far more often than anything else, and
 * `reach` answers it by testing every other block for overlap — fine for a tap
 * on a board, ruinous inside a breadth-first search that visits hundreds of
 * thousands of positions. Building the grid once per position turns each step
 * of a slide into a walk along the block's leading edge.
 */
function occupancy(puzzle: Puzzle, blocks: Block[]): Uint8Array {
  const g = new Uint8Array(puzzle.w * puzzle.h);
  for (const b of blocks)
    for (let j = b.y; j < b.y + b.h; j++)
      for (let i = b.x; i < b.x + b.w; i++) g[j * puzzle.w + i] = 1;
  return g;
}

/**
 * How far a block goes, against a prepared grid.
 *
 * Only the leading edge is checked: a block sliding up vacates the row it came
 * from, so the cells it is about to enter are the only ones that can stop it.
 */
function reachOn(puzzle: Puzzle, g: Uint8Array, b: Block, dir: Dir): number {
  const { w, h } = puzzle;
  let d = 0;
  for (;;) {
    const n = d + 1;
    if (dir === "up") {
      const y = b.y - n;
      if (y < 0) break;
      let clear = true;
      for (let i = b.x; i < b.x + b.w; i++) if (g[y * w + i]) { clear = false; break; }
      if (!clear) break;
    } else if (dir === "down") {
      const y = b.y + b.h - 1 + n;
      if (y >= h) break;
      let clear = true;
      for (let i = b.x; i < b.x + b.w; i++) if (g[y * w + i]) { clear = false; break; }
      if (!clear) break;
    } else if (dir === "left") {
      const x = b.x - n;
      if (x < 0) break;
      let clear = true;
      for (let j = b.y; j < b.y + b.h; j++) if (g[j * w + x]) { clear = false; break; }
      if (!clear) break;
    } else {
      const x = b.x + b.w - 1 + n;
      if (x >= w) break;
      let clear = true;
      for (let j = b.y; j < b.y + b.h; j++) if (g[j * w + x]) { clear = false; break; }
      if (!clear) break;
    }
    d = n;
  }
  return d;
}

/**
 * The shortest solution, or null if there is none.
 *
 * Breadth-first, so the first time the board comes up empty that depth *is* the
 * minimum — which is the whole reason par can be a promise rather than an
 * estimate. `cap` bounds the search so a pathological board cannot hang the
 * generator; hitting it returns null, and the board is thrown away rather than
 * shipped with a par nobody proved.
 *
 * Returning null for both "no solution" and "gave up" is deliberate: the
 * caller's only correct response to either is to discard the board, and a
 * distinction it cannot act on would just invite it to ship one anyway.
 */
export function solve(puzzle: Puzzle, cap = 400_000): number | null {
  const start = puzzle.blocks.map((b) => ({ ...b }));
  if (!start.length) return 0;

  let frontier: Block[][] = [start];
  const seen = new Set<string>([encode(start)]);
  let depth = 0;
  let visited = 0;

  while (frontier.length) {
    depth++;
    const next: Block[][] = [];
    for (const blocks of frontier) {
      if (++visited > cap) return null;
      const g = occupancy(puzzle, blocks);
      for (const b of blocks) {
        for (const dir of DIRS) {
          const max = reachOn(puzzle, g, b, dir);
          if (!max) continue;
          const [dx, dy] = STEP[dir];
          const parked = { ...b, x: b.x + dx * max, y: b.y + dy * max };
          const canExit = atWall(puzzle, parked, dir) && exitsThrough(puzzle, parked, dir);
          for (let d = 1; d <= max; d++) {
            const leaving = canExit && d === max;
            const moved = leaving
              ? blocks.filter((o) => o.id !== b.id)
              : blocks.map((o) => (o.id === b.id ? { ...o, x: o.x + dx * d, y: o.y + dy * d } : o));
            if (!moved.length) return depth;
            const key = encode(moved);
            if (seen.has(key)) continue;
            seen.add(key);
            next.push(moved);
          }
        }
      }
    }
    frontier = next;
  }
  return null;
}
