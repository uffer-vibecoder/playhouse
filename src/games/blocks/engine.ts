/**
 * Colour Blocks — one block is trying to get out. The rest are in the way.
 *
 * Zero imports, like every engine here: it has to run in the browser, in the
 * generator script and in the test suite, and the only way that stays true is
 * to depend on nothing.
 *
 * ── What the game is ────────────────────────────────────────────────────────
 *
 * One marked block has an exit. Everything else is a neutral obstacle that can
 * be shoved around and never leaves. That is the whole shape of it, and it is
 * the correction that made this a game rather than a tidying exercise: the
 * first version had *every* block leaving through a gate of its own colour,
 * which is busy to look at and asks the same small question eight times.
 *
 * ── What makes it fit ───────────────────────────────────────────────────────
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
 * The one block that matters is told apart by more than its colour: it carries
 * a mark, the obstacles carry none, and the exit is a gap in the wall rather
 * than a coloured strip. Play it in greyscale and it still reads — that is the
 * test, not a preference.
 */

export type Dir = "up" | "down" | "left" | "right";
export type Edge = "top" | "bottom" | "left" | "right";

export type Block = {
  id: number;
  /** top-left cell */
  x: number;
  y: number;
  w: number;
  h: number;
  /** the one that is trying to leave. Exactly one block on a board has this. */
  hero?: boolean;
};

/**
 * The way out. `at` is where it starts along that edge and `len` how many cells
 * it spans — the hero leaves only if its whole cross-section fits inside, so a
 * three-wide block cannot squeeze through a one-wide gap.
 *
 * One per board. There is only one block that can use it.
 */
export type Gate = { edge: Edge; at: number; len: number };

export type Puzzle = {
  id: string;
  w: number;
  h: number;
  blocks: Block[];
  gate: Gate;
  /** the shortest solution, in moves — proved by the generator, not estimated */
  par: number;
};

export type State = {
  blocks: Block[];
  moves: number;
  /**
   * Has the marked block actually left?
   *
   * Recorded rather than inferred from "no hero on the board". Those read the
   * same on a well-formed puzzle and differently on a broken one: a board that
   * never had a hero would otherwise be won before it started, which is how a
   * generator that forgot to mark a block would ship sixty boards that all
   * congratulate you on arrival.
   */
  freed: boolean;
  /** positions before each move, so undo is exact rather than reconstructed */
  past: Block[][];
};

/** What a save holds: where the blocks are and how many moves it took. */
export type Saved = { blocks: Block[]; moves: number; freed?: boolean };

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
  return { blocks, moves: restored?.moves ?? 0, past: [], freed: restored?.freed ?? false };
}

export const toSave = (s: State): Saved => ({ blocks: s.blocks, moves: s.moves, freed: s.freed });

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
  // only the marked block has anywhere to go; the rest are furniture
  if (!b.hero) return false;
  const g = puzzle.gate;
  if (g.edge !== EDGE_OF[dir]) return false;
  const across = g.edge === "top" || g.edge === "bottom";
  const from = across ? b.x : b.y;
  const to = from + (across ? b.w : b.h);
  return from >= g.at && to <= g.at + g.len;
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
  const me = blocks.find((b) => b.id === id);
  /**
   * A block that is not there goes nowhere.
   *
   * This used to assert the block existed, and it is reachable: pick up the
   * hero, drag it out through the gate, then press an arrow key. The board
   * still remembers which block was picked, that block has left, and the
   * non-null assertion turned a no-op into a TypeError thrown inside a React
   * state updater — which is a white screen on a board you just won. Found by
   * fuzzing, not by playing.
   *
   * Returning "cannot move" is also what `slide` already promises callers:
   * the same state back, and no exceptions for a block that cannot move.
   */
  if (!me) return { max: 0, canExit: false };
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

  /**
   * Stepping out from where it already stands is a move in its own right.
   *
   * A block pressed against its own doorway has nowhere to travel, so `max` is
   * zero and every path below used to skip it — meaning the one block that is
   * *already at the exit* was the one block that could not use it. You had to
   * move it away and bring it back. This was true of the old rules too and
   * never showed, because no generated board happened to start a block flush
   * against its gate.
   */
  if (canExit && max === 0) {
    return {
      blocks: s.blocks.filter((b) => b.id !== id),
      moves: s.moves + 1,
      past: [...s.past, s.blocks.map((b) => ({ ...b }))],
      freed: true,
    };
  }
  if (max === 0) return s;

  const d = Math.min(distance, max);
  if (d <= 0) return s;

  const leaving = canExit && d === max;
  const [dx, dy] = STEP[dir];
  const past = [...s.past, s.blocks.map((b) => ({ ...b }))];

  const blocks = leaving
    ? s.blocks.filter((b) => b.id !== id)
    : s.blocks.map((b) => (b.id === id ? { ...b, x: b.x + dx * d, y: b.y + dy * d } : b));

  return { blocks, moves: s.moves + 1, past, freed: s.freed || leaving };
}

export function undo(s: State): State {
  if (!s.past.length) return s;
  const blocks = s.past[s.past.length - 1];
  return {
    blocks,
    moves: s.moves - 1,
    past: s.past.slice(0, -1),
    // stepping back to a board the hero is standing on means it has not left
    freed: s.freed && !blocks.some((b) => b.hero),
  };
}

/** Won when the marked block has left. The obstacles stay where they are. */
export const isSolved = (s: State) => s.freed;

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
  /**
   * The hero is packed apart from the rest, because it is not interchangeable
   * with anything: two obstacles swapping places is the same position, the hero
   * swapping with an obstacle is not. Folding the obstacles together is most of
   * what keeps the search small.
   *
   * This used to multiply by a colour index. When colour stopped being part of
   * the game that read `undefined`, every state hashed to `NaN,NaN`, and the
   * search decided the very first move it tried had already been seen — so it
   * generated nothing, explored one level, and reported every board unsolvable.
   */
  let hero = "-";
  const packed: number[] = [];
  for (const b of blocks) {
    const n = (((b.w * 4 + b.h) * 8 + b.y) * 8 + b.x);
    if (b.hero) hero = String(n);
    else packed.push(n);
  }
  packed.sort((a, b) => a - b);
  return hero + "/" + packed.join(",");
}


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
  // No marked block means nothing to free. Without this the search reads the
  // very first position as already won and reports a par of one for a board
  // that cannot be played at all — the same trap `isSolved` had.
  if (!start.some((b) => b.hero)) return null;

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
          const [dx, dy] = STEP[dir];
          const parked = { ...b, x: b.x + dx * max, y: b.y + dy * max };
          const canExit = atWall(puzzle, parked, dir) && exitsThrough(puzzle, parked, dir);
          // a block already in its doorway leaves without travelling — see the
          // note in `slide`
          if (!max) {
            if (canExit) return depth;
            continue;
          }
          for (let d = 1; d <= max; d++) {
            const leaving = canExit && d === max;
            const moved = leaving
              ? blocks.filter((o) => o.id !== b.id)
              : blocks.map((o) => (o.id === b.id ? { ...o, x: o.x + dx * d, y: o.y + dy * d } : o));
            // won when the marked block has left, not when the board is bare.
            // This read `!moved.length` under the old every-block-escapes rule,
            // and left that way the search can never succeed at all.
            if (!moved.some((o) => o.hero)) return depth;
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
