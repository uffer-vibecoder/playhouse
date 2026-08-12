/**
 * Water Sort — pour colour between tubes until each tube holds one colour.
 *
 * Zero imports, like every engine here.
 *
 * ── What was measured before any of this was written ────────────────────────
 *
 * Two spare tubes, or none. Across 200 random deals at 6, 8, 10 and 12
 * colours, every single one was solvable with two spare tubes and essentially
 * none was solvable with one — 2 in 200, then 1 in 200. So the number of spare
 * tubes is not a difficulty dial, which is what it looks like: it is the
 * difference between a puzzle and an impossibility. Two, always.
 *
 * That also settled how boards are made. Since a random deal is always
 * solvable and proving it costs a median of 25–200 search steps, boards are
 * dealt at random and then proved, rather than built backwards from a solved
 * state by un-pouring. Dealing gives far better variety, and the proof is
 * cheap enough to run on every board that ships — which is the promise every
 * archive here makes.
 *
 * Difficulty is the number of colours, and it is a clean ladder. Shortest
 * solutions cluster tightly and barely overlap between neighbours:
 *
 *     5 colours   median 15 moves   (11–18)
 *     6 colours   median 18         (12–21)
 *     8 colours   median 25         (20–28)
 *    10 colours   median 31         (27–35)
 */

export type Tier = "easy" | "gentle" | "steady" | "tricky";

/** Units of colour in a full tube, and every tube's capacity. */
export const DEPTH = 4;

/** Spare tubes. Not a setting — see the note above. */
export const SPARE = 2;

export type Puzzle = {
  id: string;
  /** how many colours, which is the difficulty */
  colours: number;
  /** the deal: each tube bottom-first, then `SPARE` empty ones */
  tubes: number[][];
  /** the shortest solution, proved before it shipped */
  par: number;
  tier: Tier;
};

export type State = {
  tubes: number[][];
  moves: number;
  /** every earlier arrangement, so a pour can be taken back */
  past: number[][][];
};

export type Saved = { tubes: number[][]; moves: number };

export function initialState(puzzle: Puzzle, restored?: Saved): State {
  const fresh = { tubes: puzzle.tubes.map((t) => [...t]), moves: 0, past: [] };
  if (!restored?.tubes) return fresh;

  /* A save is only trusted if it holds exactly the same colours as the deal.
     Anything else is a save from an older cut of the archive, and restoring it
     would put a board on screen that cannot be finished. */
  const count = (tubes: number[][]) => {
    const n = new Map<number, number>();
    for (const t of tubes) for (const v of t) n.set(v, (n.get(v) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(",");
  };
  const shaped =
    Array.isArray(restored.tubes) &&
    restored.tubes.length === puzzle.tubes.length &&
    restored.tubes.every((t) => Array.isArray(t) && t.length <= DEPTH) &&
    count(restored.tubes) === count(puzzle.tubes);
  if (!shaped) return fresh;

  return {
    tubes: restored.tubes.map((t) => [...t]),
    moves: Number.isInteger(restored.moves) && restored.moves >= 0 ? restored.moves : 0,
    // history is not saved: it would multiply the payload by the move count,
    // and undo across a reload is not a promise worth that
    past: [],
  };
}

export const toSave = (s: State): Saved => ({ tubes: s.tubes, moves: s.moves });

/* ── the pour ─────────────────────────────────────────────────────────────── */

export const topOf = (tube: number[]): number | null =>
  tube.length ? tube[tube.length - 1] : null;

/** How many of the top colour sit together at the top of this tube. */
export function runLength(tube: number[]): number {
  if (!tube.length) return 0;
  let n = 1;
  for (let i = tube.length - 2; i >= 0 && tube[i] === tube[tube.length - 1]; i--) n++;
  return n;
}

export const isFull = (tube: number[]) => tube.length >= DEPTH;

/** A tube holding one colour and nothing else — done, whether full or not. */
export const isPure = (tube: number[]) => tube.length > 0 && tube.every((v) => v === tube[0]);

/** Can colour move from one tube to the other? */
export function canPour(tubes: number[][], from: number, to: number): boolean {
  if (from === to) return false;
  const a = tubes[from], b = tubes[to];
  if (!a?.length || !b || isFull(b)) return false;
  return b.length === 0 || topOf(b) === topOf(a);
}

/** How many units a pour would actually move. */
export function pourSize(tubes: number[][], from: number, to: number): number {
  if (!canPour(tubes, from, to)) return 0;
  return Math.min(runLength(tubes[from]), DEPTH - tubes[to].length);
}

/**
 * Pour, moving the whole run of the top colour that fits.
 *
 * Returns the same state when nothing would happen, so callers can compare by
 * identity to know whether the tap did anything — no exceptions for a pour
 * that is not allowed.
 */
export function pour(s: State, from: number, to: number): State {
  const n = pourSize(s.tubes, from, to);
  if (n === 0) return s;
  const tubes = s.tubes.map((t) => [...t]);
  const colour = topOf(tubes[from])!;
  for (let i = 0; i < n; i++) {
    tubes[from].pop();
    tubes[to].push(colour);
  }
  return { tubes, moves: s.moves + 1, past: [...s.past, s.tubes.map((t) => [...t])] };
}

export function undo(s: State): State {
  if (!s.past.length) return s;
  return {
    tubes: s.past[s.past.length - 1].map((t) => [...t]),
    moves: s.moves - 1,
    past: s.past.slice(0, -1),
  };
}

/** Every tube is empty, or holds one colour all the way up. */
export const isSolved = (s: State) =>
  s.tubes.every((t) => t.length === 0 || (t.length === DEPTH && isPure(t)));

export const isPerfect = (puzzle: Puzzle, s: State) => isSolved(s) && s.moves <= puzzle.par;

/** Tubes finished, for a progress line. */
export const done = (s: State) => s.tubes.filter((t) => t.length === DEPTH && isPure(t)).length;

/** Is there anything left to do at all? A board with no legal pour is stuck. */
export function stuck(s: State): boolean {
  if (isSolved(s)) return false;
  for (let a = 0; a < s.tubes.length; a++) {
    for (let b = 0; b < s.tubes.length; b++) if (canPour(s.tubes, a, b)) return false;
  }
  return true;
}

/* ── the search ───────────────────────────────────────────────────────────────
   Used by the generator to prove a deal and measure its par, and by the board
   to offer a hint.
── */

/**
 * The key that folds equivalent arrangements together.
 *
 * Tubes are interchangeable — which physical tube holds which stack does not
 * change the puzzle — so the key sorts them before hashing. Colour Blocks is
 * the cautionary tale here: its state key was quietly wrong, every board
 * hashed the same, and the search explored one level and pronounced every
 * board unsolvable. Without this sort the failure is subtler but the same
 * shape — pouring into empty tube 11 rather than empty tube 10 looks like a
 * new arrangement, and the search drowns in copies of itself.
 */
export const encode = (tubes: number[][]) =>
  tubes.map((t) => t.join(",")).sort().join("|");

/**
 * The pours worth trying.
 *
 * Two are pruned because they cannot help and they double the branching:
 * emptying a tube that is already one colour into an empty tube (that only
 * moves the problem sideways), and treating two empty tubes as two different
 * destinations when every empty tube is the same tube.
 */
export function options(tubes: number[][]): [number, number][] {
  const out: [number, number][] = [];
  for (let a = 0; a < tubes.length; a++) {
    const from = tubes[a];
    if (!from.length) continue;
    if (isPure(from) && isFull(from)) continue; // finished; leave it alone
    let usedAnEmpty = false;
    for (let b = 0; b < tubes.length; b++) {
      if (a === b || isFull(tubes[b])) continue;
      if (!tubes[b].length) {
        if (isPure(from)) continue;
        if (usedAnEmpty) continue;
        usedAnEmpty = true;
      } else if (topOf(tubes[b]) !== topOf(from)) continue;
      out.push([a, b]);
    }
  }
  return out;
}

const solvedTubes = (tubes: number[][]) =>
  tubes.every((t) => t.length === 0 || (t.length === DEPTH && isPure(t)));

const poured = (tubes: number[][], from: number, to: number) => {
  const next = tubes.map((t) => [...t]);
  const n = Math.min(runLength(next[from]), DEPTH - next[to].length);
  const colour = topOf(next[from])!;
  for (let i = 0; i < n; i++) { next[from].pop(); next[to].push(colour); }
  return next;
};

/**
 * The shortest way home, as a list of pours, or null if there is none.
 *
 * Breadth-first over folded arrangements, so the first solution found is the
 * shortest — which is what `par` means here, and a par that is not actually
 * the shortest is worse than no par at all.
 */
export function solve(tubes: number[][], budget = 400_000): [number, number][] | null | "capped" {
  if (solvedTubes(tubes)) return [];
  let frontier: { tubes: number[][]; path: [number, number][] }[] = [{ tubes, path: [] }];
  const seen = new Set([encode(tubes)]);
  let steps = 0;

  while (frontier.length) {
    const next: typeof frontier = [];
    for (const node of frontier) {
      for (const [a, b] of options(node.tubes)) {
        if (++steps > budget) return "capped";
        const t = poured(node.tubes, a, b);
        const k = encode(t);
        if (seen.has(k)) continue;
        seen.add(k);
        const path: [number, number][] = [...node.path, [a, b]];
        if (solvedTubes(t)) return path;
        next.push({ tubes: t, path });
      }
    }
    frontier = next;
  }
  return null;
}

/** The next pour on a shortest path from here, for a hint. */
export function nextPour(s: State, budget = 200_000): [number, number] | null {
  const path = solve(s.tubes, budget);
  return Array.isArray(path) && path.length ? path[0] : null;
}
