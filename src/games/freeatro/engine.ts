/**
 * Free-Atro — Freecell, scored.
 *
 * Zero imports, like every engine here.
 *
 * ── Why Freecell and not a fresh deal each round ────────────────────────────
 *
 * The scoring idea came from Balatro and the tableau came from Freecell, and
 * that pairing is the whole point rather than a mashup for its own sake. A
 * scoring run built on a random draw compares luck as much as skill: two people
 * playing "the same" game are not playing the same game. A Freecell deal can be
 * **proved solvable before it ships** — the solver below does it — so every
 * board carries the same guarantee the codewords and the block boards do, and
 * two people given a deal number are genuinely racing the same problem.
 *
 * So: the deal is fair and provably winnable, and the score is what separates
 * two people who both finished.
 *
 * ── Cards ───────────────────────────────────────────────────────────────────
 *
 * A card is an integer 0–51. Rank is `card % 13` (0 = ace, 12 = king), suit is
 * `(card / 13) | 0` in the order spades, hearts, diamonds, clubs. Integers
 * rather than objects because the solver visits hundreds of thousands of
 * positions and every allocation there is felt.
 */

export const SUITS = ["♠", "♥", "♦", "♣"] as const;
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;

export const rankOf = (card: number) => card % 13;
export const suitOf = (card: number) => (card / 13) | 0;
/** Hearts and diamonds. Colour is what the tableau's alternation rule is about. */
export const isRed = (card: number) => suitOf(card) === 1 || suitOf(card) === 2;
export const name = (card: number) => `${RANKS[rankOf(card)]}${SUITS[suitOf(card)]}`;

export const COLUMNS = 8;
export const CELLS = 4;

/**
 * How many ranks each suit brings, ace upwards.
 *
 * A full 52-card Freecell is twenty minutes and more, which is a lovely way to
 * spend an evening and the wrong unit for a run of rounds. Eight ranks — ace to
 * eight, thirty-two cards — plays in about five minutes and still has every
 * decision the full game has: the cells matter, emptying a column matters, and
 * digging out a buried ace matters.
 *
 * The rank count is stored on the deal rather than assumed, so a longer round
 * later costs a number in a table and not a rewrite.
 */
export const ROUND_RANKS = 8;

export type Deal = {
  id: string;
  seed: number;
  /** ranks per suit in this deal, ace upwards */
  ranks: number;
  /** a way home the builder found, in moves — not proved shortest, so not a par */
  route: number;
};

/* ── a run ────────────────────────────────────────────────────────────────
   A round is one deal. A run is a sequence of them, and what carries between
   rounds is a purse: coins earned by beating the target, spent on making the
   next round easier. That is the loop the whole thing is built around — one
   deal is a puzzle, but a run is a series of decisions about what to spend on
   and when to spend it.
── */

export type Upgrade = "cell" | "mult" | "purse";

export const UPGRADES: { id: Upgrade; name: string; cost: number; note: string; max: number }[] = [
  { id: "cell", name: "Another cell", cost: 6, note: "one more place to park a card", max: 2 },
  { id: "mult", name: "Head start", cost: 5, note: "every round opens a multiplier higher", max: 3 },
  { id: "purse", name: "Deeper pockets", cost: 4, note: "one more coin for every round won", max: 3 },
];

export type Run = {
  /** which round is being played, from 1 */
  round: number;
  /**
   * Where in the archive this run started.
   *
   * Rounds walk on from here, so two runs are different sequences of deals
   * while each one stays perfectly reproducible — the same run replayed deals
   * the same rounds in the same order.
   */
  offset: number;
  coins: number;
  /** bought upgrades, repeats allowed up to each one's max */
  bought: Upgrade[];
  /** each round's score, so a finished run can be read back */
  scores: number[];
};

export const newRun = (offset = 0): Run => ({ round: 1, offset, coins: 0, bought: [], scores: [] });

export const owned = (run: Run, id: Upgrade) => run.bought.filter((u) => u === id).length;

/** Cells available this round: four, plus any bought. */
export const cellsFor = (run: Run) => CELLS + owned(run, "cell");

/** The multiplier a round opens on. */
export const baseMult = (run: Run) => 1 + owned(run, "mult");

/**
 * What this round has to beat.
 *
 * Every card comes home in a won round, so the chips are fixed — four suits of
 * 1+2+…+8 is 144. The target is therefore a statement about multiplier, and it
 * climbs: round one asks for an average of not quite two, and by round six you
 * cannot reach it without keeping runs standing while you dig.
 */
export const targetFor = (round: number) => 240 + (round - 1) * 70;

/**
 * Coins for a finished round.
 *
 * Three for winning at all, one for every fifty points past the target, and
 * whatever deeper pockets adds. A round that misses its target pays nothing —
 * the purse rewards clearing a round, not turning up to one.
 */
export function purse(run: Run, score: number, round: number): number {
  if (score < targetFor(round)) return 0;
  return 3 + Math.floor((score - targetFor(round)) / 50) + owned(run, "purse");
}

/** Buy one, if it is affordable and not already maxed. */
export function buy(run: Run, id: Upgrade): Run {
  const item = UPGRADES.find((u) => u.id === id);
  if (!item) return run;
  if (run.coins < item.cost || owned(run, id) >= item.max) return run;
  return { ...run, coins: run.coins - item.cost, bought: [...run.bought, id] };
}

/** Which deal this round plays. */
export const dealFor = (run: Run, deals: Deal[]) =>
  deals[(run.offset + run.round - 1) % deals.length];

/** Bank the round and move on. */
export function nextRound(run: Run, score: number): Run {
  return {
    ...run,
    round: run.round + 1,
    coins: run.coins + purse(run, score, run.round),
    scores: [...run.scores, score],
  };
}

export type Table = {
  /** eight piles, each bottom-to-top */
  columns: number[][];
  /** cells, null when empty — four, or more if the run has bought some */
  cells: (number | null)[];
  /** highest rank placed per suit, -1 for empty */
  foundations: number[];
  /**
   * Ranks per suit in play, so the table knows when it is finished.
   *
   * Carried here rather than passed to every function that needs it: `isWon`
   * once read `f === 12` and would have quietly never fired on a short deck,
   * which is the kind of bug that looks like the game hanging.
   */
  ranks: number;
};

export type Score = {
  chips: number;
  mult: number;
  /** banked score from cards already home */
  total: number;
  /** how many alternating runs of three or more have been built */
  runs: number;
  /** where the multiplier starts, before anything is built — bought, not earned */
  base: number;
};

export type State = {
  table: Table;
  score: Score;
  moves: number;
  /** positions before each move, for undo */
  past: { table: Table; score: Score }[];
};

export type Saved = { table: Table; score: Score; moves: number };

/* ── dealing ──────────────────────────────────────────────────────────────── */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A deal from a seed.
 *
 * Fisher–Yates with a seeded source, so the same number gives the same table on
 * every device forever — which is what makes "deal 12" a thing two people can
 * both play rather than a coincidence.
 */
export function deal(seed: number, ranks = ROUND_RANKS, cells = CELLS): Table {
  const rand = rng(seed);
  // suits stay four; it is the ranks that shorten, so colour and alternation —
  // the whole texture of the tableau — are untouched
  const deck: number[] = [];
  for (let suit = 0; suit < 4; suit++) for (let r = 0; r < ranks; r++) deck.push(suit * 13 + r);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const columns: number[][] = Array.from({ length: COLUMNS }, () => []);
  deck.forEach((card, i) => columns[i % COLUMNS].push(card));
  return { columns, cells: Array(cells).fill(null), foundations: [-1, -1, -1, -1], ranks };
}

export const cloneTable = (t: Table): Table => ({
  columns: t.columns.map((c) => c.slice()),
  cells: t.cells.slice(),
  foundations: t.foundations.slice(),
  ranks: t.ranks,
});

export function initialState(d: Deal, run: Run, restored?: Saved): State {
  const base = baseMult(run);
  if (restored?.table?.columns?.length === COLUMNS && restored.table.ranks) {
    return {
      table: cloneTable(restored.table),
      score: { ...restored.score, base },
      moves: restored.moves,
      past: [],
    };
  }
  return {
    table: deal(d.seed, d.ranks ?? ROUND_RANKS, cellsFor(run)),
    score: { chips: 0, mult: base, total: 0, runs: 0, base },
    moves: 0,
    past: [],
  };
}

export const toSave = (s: State): Saved => ({ table: s.table, score: s.score, moves: s.moves });

/* ── the rules ────────────────────────────────────────────────────────────── */

/** Tableau order: down one rank, and the colour has to alternate. */
export const stacks = (below: number, above: number) =>
  rankOf(below) === rankOf(above) + 1 && isRed(below) !== isRed(above);

/**
 * How many cards move as one.
 *
 * Freecell's supermove is not really a rule, it is an accounting shortcut for
 * shuffling cards through the free cells one at a time. `(free + 1) × 2^empty`
 * is the standard reckoning, and the doubling for empty columns is why they are
 * worth so much more than a cell.
 */
export function liftLimit(t: Table, toEmptyColumn = false): number {
  const free = t.cells.filter((c) => c === null).length;
  let empty = t.columns.filter((c) => c.length === 0).length;
  // the column being moved into cannot also stage the move
  if (toEmptyColumn && empty > 0) empty -= 1;
  return (free + 1) * 2 ** empty;
}

/** The longest ordered run sitting on the end of a column. */
export function runLength(column: number[]): number {
  let n = 1;
  for (let i = column.length - 1; i > 0; i--) {
    if (!stacks(column[i - 1], column[i])) break;
    n++;
  }
  return column.length ? n : 0;
}

export const foundationReady = (t: Table, card: number) =>
  t.foundations[suitOf(card)] === rankOf(card) - 1;

/* ── moves ────────────────────────────────────────────────────────────────── */

export type Move =
  | { kind: "toFoundation"; from: { pile: "column" | "cell"; index: number } }
  | { kind: "toCell"; column: number }
  | { kind: "toColumn"; from: { pile: "column" | "cell"; index: number }; to: number; count: number };

function push(s: State, table: Table, score: Score): State {
  return {
    table,
    score,
    moves: s.moves + 1,
    past: [...s.past, { table: s.table, score: s.score }].slice(-200),
  };
}

/**
 * Send a card home, and score it.
 *
 * This is the only move that scores, and deliberately: it is the one that
 * commits. Chips are the card's rank, so a king is worth thirteen times an ace,
 * and the multiplier is what the tableau work has earned.
 */
export function toFoundation(s: State, from: { pile: "column" | "cell"; index: number }): State {
  const t = s.table;
  const card = from.pile === "cell" ? t.cells[from.index] : t.columns[from.index].at(-1) ?? null;
  if (card === null || card === undefined) return s;
  if (!foundationReady(t, card)) return s;

  const table = cloneTable(t);
  if (from.pile === "cell") table.cells[from.index] = null;
  else table.columns[from.index].pop();
  table.foundations[suitOf(card)] = rankOf(card);

  const chips = rankOf(card) + 1;
  const finished = table.foundations.filter((f) => f === 12).length;
  const score: Score = {
    ...s.score,
    // a completed suit is worth a permanent point of multiplier: the reward for
    // finishing something rather than for hoarding
    mult: s.score.base + s.score.runs + finished,
    chips: s.score.chips + chips,
    total: s.score.total + chips * (s.score.base + s.score.runs + finished),
  };
  return push(s, table, score);
}

export function toCell(s: State, column: number): State {
  const t = s.table;
  const card = t.columns[column]?.at(-1);
  if (card === undefined) return s;
  const slot = t.cells.findIndex((c) => c === null);
  if (slot < 0) return s;

  const table = cloneTable(t);
  table.columns[column].pop();
  table.cells[slot] = card;
  return push(s, table, s.score);
}

/**
 * Move cards between columns, or a cell into a column.
 *
 * Building an ordered run of three or more is what earns multiplier, so the
 * scoring rewards the part of Freecell that is actually skilful — arranging the
 * tableau — rather than the part that is bookkeeping.
 */
export function toColumn(
  s: State,
  from: { pile: "column" | "cell"; index: number },
  to: number,
  count = 1
): State {
  const t = s.table;
  if (to < 0 || to >= COLUMNS) return s;

  if (from.pile === "cell") {
    const card = t.cells[from.index];
    if (card === null) return s;
    const dest = t.columns[to];
    if (dest.length && !stacks(dest.at(-1)!, card)) return s;
    const table = cloneTable(t);
    table.cells[from.index] = null;
    table.columns[to].push(card);
    return push(s, table, scoreRuns(s.score, table, s.score.base));
  }

  const src = t.columns[from.index];
  if (from.index === to || count < 1 || count > src.length) return s;
  const moving = src.slice(src.length - count);
  // the whole lifted group has to be in order already
  for (let i = 1; i < moving.length; i++) if (!stacks(moving[i - 1], moving[i])) return s;

  const dest = t.columns[to];
  if (dest.length && !stacks(dest.at(-1)!, moving[0])) return s;
  if (count > liftLimit(t, dest.length === 0)) return s;

  const table = cloneTable(t);
  table.columns[from.index].splice(src.length - count, count);
  table.columns[to].push(...moving);
  return push(s, table, scoreRuns(s.score, table, s.score.base));
}

/**
 * Count the runs of three or more on the board, and let the multiplier follow.
 *
 * Recomputed rather than incremented: a run can be broken as easily as built,
 * and a multiplier that only ever went up would reward making a mess and then
 * tidying it repeatedly.
 */
function scoreRuns(score: Score, table: Table, base: number): Score {
  const runs = table.columns.reduce((n, col) => n + (runLength(col) >= 3 ? 1 : 0), 0);
  const finished = table.foundations.filter((f) => f === table.ranks - 1).length;
  return { ...score, runs, mult: base + runs + finished };
}

export function undo(s: State): State {
  if (!s.past.length) return s;
  const last = s.past[s.past.length - 1];
  return { table: last.table, score: last.score, moves: s.moves - 1, past: s.past.slice(0, -1) };
}

/**
 * Send home everything that is safe to send.
 *
 * "Safe" is the classic rule: a card can always go up if both colours of the
 * next rank down are already home, because nothing left in the tableau will
 * ever need it. Anything looser and the convenience starts losing games for
 * people.
 */
export function autoplay(s: State): State {
  let out = s;
  for (let again = true; again; ) {
    again = false;
    const t = out.table;
    const safe = (card: number) => {
      if (!foundationReady(t, card)) return false;
      const r = rankOf(card);
      if (r <= 1) return true; // aces and twos are never needed below
      const red = Math.min(t.foundations[1], t.foundations[2]);
      const black = Math.min(t.foundations[0], t.foundations[3]);
      return isRed(card) ? black >= r - 1 : red >= r - 1;
    };
    for (let i = 0; i < t.cells.length; i++) {
      const c = t.cells[i];
      if (c !== null && safe(c)) { out = toFoundation(out, { pile: "cell", index: i }); again = true; break; }
    }
    if (again) continue;
    for (let i = 0; i < COLUMNS; i++) {
      const c = t.columns[i].at(-1);
      if (c !== undefined && safe(c)) { out = toFoundation(out, { pile: "column", index: i }); again = true; break; }
    }
  }
  return out;
}

export const isWon = (t: Table) => t.foundations.every((f) => f === t.ranks - 1);

/* ── proving a deal ───────────────────────────────────────────────────────── */

function key(t: Table): string {
  // cells are interchangeable, so sorting them folds together positions that
  // differ only in which cell holds what — a large share of the search space
  const cells = t.cells.map((c) => (c === null ? -1 : c)).sort((a, b) => a - b).join(",");
  const cols = t.columns.map((c) => c.join(".")).sort().join("|");
  return `${cells}/${t.foundations.join(",")}/${cols}`;
}

/**
 * Is this deal winnable, and in roughly how many moves?
 *
 * Depth-first with a visited set and a strong move ordering — foundations
 * first, then moves that empty a column, then the rest. Freecell is famously
 * almost-always solvable, so this is not really a search for a rare solution;
 * it is a guarantee that the one deal we are about to ship is not the exception.
 *
 * Returns the move count of the first solution found, or null if the node
 * budget runs out. Null means the deal is discarded rather than shipped with a
 * promise nobody checked — the same rule the block boards follow.
 */
/**
 * How far from home this position looks.
 *
 * Lower is better. Depth-first search alone does not solve Freecell — the first
 * version of this proved two deals in twelve and called a 388-move wander a
 * solution, because with no sense of direction it will happily shuffle cards
 * sideways for hours. The fix is not a bigger budget, it is knowing which way
 * is forwards.
 *
 * Three terms, in the order they matter:
 *   · cards still out of the foundations — the actual goal
 *   · cards sitting on top of one the foundations want next, because every one
 *     of those has to be moved before any progress happens
 *   · cells in use, since a full set of cells is how a game strands itself
 */
function distance(t: Table): number {
  const cards = t.ranks * 4;
  const home = t.foundations.reduce((n, f) => n + f + 1, 0);
  let buried = 0;
  for (let suit = 0; suit < 4; suit++) {
    const want = t.foundations[suit] + 1;
    if (want >= t.ranks) continue;
    const card = suit * 13 + want;
    for (const col of t.columns) {
      const at = col.indexOf(card);
      if (at >= 0) {
        buried += col.length - at - 1;
        break;
      }
    }
  }
  const cellsUsed = t.cells.filter((c) => c !== null).length;
  return (cards - home) * 3 + buried * 2 + cellsUsed;
}

/**
 * Find a way to win this deal, or say it could not.
 *
 * Best-first: always expand whichever reachable position looks closest to home.
 * That is greedy rather than optimal, so the move count it comes back with is
 * *a* solution rather than the shortest one — which is why the archive calls
 * that number a route and not a par to be beaten.
 *
 * What it is for is the guarantee: a deal only ships if this finds a win.
 * Freecell is famously almost always solvable, so this is not hunting a rare
 * solution; it is making sure the one deal about to be sent out is not the
 * exception that strands somebody.
 */
export function solve(start: Table, budget = 200_000): number | null {
  const seen = new Set<string>();

  // a small binary heap, keyed on `distance`
  const heap: { table: Table; depth: number; h: number }[] = [];
  const swap = (a: number, b: number) => { const t = heap[a]; heap[a] = heap[b]; heap[b] = t; };
  const up = (n: number) => {
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (heap[p].h <= heap[n].h) break;
      swap(p, n);
      n = p;
    }
  };
  const down = (n: number) => {
    for (;;) {
      const l = 2 * n + 1;
      const r = l + 1;
      let m = n;
      if (l < heap.length && heap[l].h < heap[m].h) m = l;
      if (r < heap.length && heap[r].h < heap[m].h) m = r;
      if (m === n) break;
      swap(m, n);
      n = m;
    }
  };
  const add = (table: Table, depth: number) => {
    heap.push({ table, depth, h: distance(table) + depth * 0.02 });
    up(heap.length - 1);
  };
  const take = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) { heap[0] = last; down(0); }
    return top;
  };

  add(cloneTable(start), 0);
  seen.add(key(start));
  let nodes = 0;

  while (heap.length) {
    const cur = take();
    if (isWon(cur.table)) return cur.depth;
    if (++nodes > budget) return null;
    for (const child of successors(cur.table)) {
      const k = key(child);
      if (seen.has(k)) continue;
      seen.add(k);
      add(child, cur.depth + 1);
    }
  }
  return null;
}

/**
 * Every position one move away, best-looking first.
 *
 * The ordering is the search: foundations, then anything that empties a column,
 * then ordinary tableau moves, and a card into a cell only as a last resort
 * because it is the move that costs the most freedom. Freecell is almost always
 * solvable, so a good order finds the win quickly rather than proving anything
 * clever.
 */
function successors(t: Table): Table[] {
  const out: { table: Table; rank: number }[] = [];

  const tryFoundation = (card: number, take: () => Table) => {
    if (!foundationReady(t, card)) return;
    const nt = take();
    nt.foundations[suitOf(card)] = rankOf(card);
    out.push({ table: nt, rank: 0 });
  };

  for (let i = 0; i < t.cells.length; i++) {
    const c = t.cells[i];
    if (c !== null)
      tryFoundation(c, () => {
        const nt = cloneTable(t);
        nt.cells[i] = null;
        return nt;
      });
  }
  for (let i = 0; i < COLUMNS; i++) {
    const c = t.columns[i].at(-1);
    if (c !== undefined)
      tryFoundation(c, () => {
        const nt = cloneTable(t);
        nt.columns[i].pop();
        return nt;
      });
  }

  for (let from = 0; from < COLUMNS; from++) {
    const src = t.columns[from];
    if (!src.length) continue;
    const most = Math.min(runLength(src), liftLimit(t));
    for (let n = most; n >= 1; n--) {
      const moving = src.slice(src.length - n);
      for (let to = 0; to < COLUMNS; to++) {
        if (to === from) continue;
        const dest = t.columns[to];
        if (dest.length === 0) {
          if (n === src.length) continue; // moving a whole column to a gap achieves nothing
          if (n > liftLimit(t, true)) continue;
        } else if (!stacks(dest.at(-1)!, moving[0])) continue;
        const nt = cloneTable(t);
        nt.columns[from].splice(src.length - n, n);
        nt.columns[to].push(...moving);
        out.push({ table: nt, rank: nt.columns[from].length === 0 ? 1 : 2 });
      }
    }
  }

  for (let i = 0; i < t.cells.length; i++) {
    const c = t.cells[i];
    if (c === null) continue;
    for (let to = 0; to < COLUMNS; to++) {
      const dest = t.columns[to];
      if (dest.length && !stacks(dest.at(-1)!, c)) continue;
      const nt = cloneTable(t);
      nt.cells[i] = null;
      nt.columns[to].push(c);
      out.push({ table: nt, rank: 2 });
    }
  }

  const slot = t.cells.findIndex((c) => c === null);
  if (slot >= 0) {
    for (let i = 0; i < COLUMNS; i++) {
      const c = t.columns[i].at(-1);
      if (c === undefined) continue;
      const nt = cloneTable(t);
      nt.columns[i].pop();
      nt.cells[slot] = c;
      out.push({ table: nt, rank: 3 });
    }
  }

  out.sort((a, b) => a.rank - b.rank);
  return out.map((o) => o.table);
}
