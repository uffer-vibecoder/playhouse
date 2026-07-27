/**
 * Solve for x — rules and generator, with no idea a browser exists.
 *
 * Same contract as the other engines: no DOM, no React, no imports, every
 * function pure and returning a new State.
 *
 * The one thing that makes this game different from the word game next door:
 * the problems are *derived from a seed*, not stored. The archive ships ten
 * integers — one seed per puzzle — and both the questions and their answers are
 * recomputed identically in every browser. So there is nothing to obfuscate and
 * nothing to leak, and two people given the same puzzle id are guaranteed the
 * same ten problems, which is what makes comparing results meaningful.
 */

export type Puzzle = {
  id: string;
  /** Everything about the puzzle, in one integer. */
  seed: number;
  added?: string;
};

/** `a·x op b = c`, where `op` is absent for the one-step multiply/divide forms. */
export type Form = "add" | "sub" | "mul" | "div" | "mul-add" | "mul-sub";

export type Problem = {
  form: Form;
  a: number;
  b: number;
  c: number;
  /** The answer. Always an integer — see `generate`. */
  x: number;
};

export type State = {
  /** One entry per problem, as typed. Empty string means untouched. */
  answers: string[];
  cursor: number;
  /** Marked by Check, cleared shortly after. */
  wrong: Set<number>;
  /** The score of the first completed attempt, once there has been one. */
  firstScore: number | null;
};

export const PROBLEMS = 10;

/* ── generation ─────────────────────────────────────────────────────────── */

/**
 * mulberry32. Small, fast, and — the only property that actually matters here —
 * completely determined by its seed, so the same puzzle id yields the same ten
 * problems on every device, forever.
 */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ONE_STEP: Form[] = ["add", "sub", "mul", "div"];
const TWO_STEP: Form[] = ["mul-add", "mul-sub"];

/**
 * Ten problems, easing from one step to two.
 *
 * Every form is built forwards — pick the answer, then construct the equation
 * around it — so the answer is an integer by construction rather than by
 * filtering. That is also why division never produces a fraction: `x` is made
 * as `a · c`, so `x ÷ a` is exact.
 */
export function generate(puzzle: Puzzle): Problem[] {
  const rand = rng(puzzle.seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const between = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

  const out: Problem[] = [];
  for (let i = 0; i < PROBLEMS; i++) {
    // the first four stay one-step; after that two-step becomes likelier
    const form =
      i < 4 ? pick(ONE_STEP) : rand() < 0.35 ? pick(ONE_STEP) : pick(TWO_STEP);

    let a = 1;
    let b = 0;
    let c = 0;
    let x = 0;

    switch (form) {
      case "add":
        x = between(1, 20);
        b = between(2, 20);
        c = x + b;
        break;
      case "sub":
        // keep c positive: subtracting past zero is a different lesson
        b = between(2, 12);
        x = between(b + 1, b + 20);
        c = x - b;
        break;
      case "mul":
        a = between(2, 9);
        x = between(2, 12);
        c = a * x;
        break;
      case "div":
        a = between(2, 6);
        c = between(2, 10);
        x = a * c;
        break;
      case "mul-add":
        a = between(2, 6);
        x = between(1, 12);
        b = between(1, 12);
        c = a * x + b;
        break;
      case "mul-sub":
        a = between(2, 6);
        x = between(2, 12);
        // b must not overshoot the product, or c goes negative and the reader
        // meets `4x − 9 = −1` in what is meant to be the gentle tier
        b = between(1, Math.min(12, a * x - 1));
        c = a * x - b;
        break;
    }
    out.push({ form, a, b, c, x });
  }
  return out;
}

/** The equation as a reader sees it. */
export function render(p: Problem): string {
  switch (p.form) {
    case "add":
      return `x + ${p.b} = ${p.c}`;
    case "sub":
      return `x − ${p.b} = ${p.c}`;
    case "mul":
      return `${p.a}x = ${p.c}`;
    case "div":
      return `x ÷ ${p.a} = ${p.c}`;
    case "mul-add":
      return `${p.a}x + ${p.b} = ${p.c}`;
    case "mul-sub":
      return `${p.a}x − ${p.b} = ${p.c}`;
  }
}

/* ── state ──────────────────────────────────────────────────────────────── */

/**
 * What gets persisted: the typed answers, and the score of the first attempt.
 *
 * `firstScore` exists because a set is redoable and this save is mutable —
 * replaying overwrites the answers, so the first attempt is gone the moment
 * someone tries again. The dashboard averages *first* attempts, and no later
 * migration can recover a number that was never written down, so it has to be
 * recorded as it happens.
 */
export type Saved = { answers: string[]; firstScore?: number };

export function initialState(restored?: Saved): State {
  const answers = Array.from({ length: PROBLEMS }, (_, i) => {
    const v = restored?.answers?.[i];
    return typeof v === "string" && /^-?\d{0,4}$/.test(v) ? v : "";
  });
  const first = restored?.firstScore;
  return {
    answers,
    cursor: 0,
    wrong: new Set(),
    firstScore:
      typeof first === "number" && Number.isInteger(first) && first >= 0 && first <= PROBLEMS
        ? first
        : null,
  };
}

/**
 * Close off the first attempt once every row has been answered.
 *
 * "Answered", not "correct" — an attempt where two were wrong still happened,
 * and averaging only successful attempts would flatter the number. Once set it
 * never changes again, whatever a replay scores.
 */
export function recordFirstScore(problems: Problem[], s: State): State {
  if (s.firstScore !== null) return s;
  if (s.answers.some((a) => a.trim() === "")) return s;
  return { ...s, firstScore: rightCount(problems, s) };
}

const replace = (xs: string[], i: number, v: string) =>
  xs.map((old, j) => (j === i ? v : old));

export function typeDigit(s: State, d: string): State {
  if (!/^\d$/.test(d)) return s;
  const cur = s.answers[s.cursor] ?? "";
  // four digits is far past any answer this generator makes; the cap only
  // stops a held key from growing the string without bound
  if (cur.replace("-", "").length >= 4) return s;
  return { ...s, answers: replace(s.answers, s.cursor, cur + d), wrong: new Set() };
}

export function backspace(s: State): State {
  const cur = s.answers[s.cursor] ?? "";
  if (!cur) return s;
  return { ...s, answers: replace(s.answers, s.cursor, cur.slice(0, -1)), wrong: new Set() };
}

/** Leading minus, toggled rather than typed — there is nowhere else it can go. */
export function toggleSign(s: State): State {
  const cur = s.answers[s.cursor] ?? "";
  const next = cur.startsWith("-") ? cur.slice(1) : "-" + cur;
  return { ...s, answers: replace(s.answers, s.cursor, next), wrong: new Set() };
}

export function moveTo(s: State, i: number): State {
  if (i < 0 || i >= PROBLEMS) return s;
  return { ...s, cursor: i };
}

export const step = (s: State, by: number): State =>
  moveTo(s, (s.cursor + by + PROBLEMS) % PROBLEMS);

/**
 * Wipe the answers but keep the first attempt's score.
 *
 * Clearing is a redo, and a redo is exactly the case `firstScore` exists to
 * survive — returning a bare `initialState()` here would erase the number the
 * moment anyone tried again, which is the failure it was added to prevent.
 */
export function clear(s: State): State {
  return { ...initialState(), firstScore: s.firstScore };
}

/* ── checking ───────────────────────────────────────────────────────────── */

export const isRight = (p: Problem, answer: string) =>
  answer.trim() !== "" && Number(answer) === p.x;

/** Mark every answered-but-wrong row. Blank rows are not mistakes yet. */
export function check(problems: Problem[], s: State): State {
  const wrong = new Set<number>();
  problems.forEach((p, i) => {
    const a = s.answers[i];
    if (a.trim() !== "" && !isRight(p, a)) wrong.add(i);
  });
  return { ...s, wrong };
}

export const dismissWrong = (s: State): State =>
  s.wrong.size ? { ...s, wrong: new Set() } : s;

export const rightCount = (problems: Problem[], s: State) =>
  problems.reduce((n, p, i) => n + (isRight(p, s.answers[i]) ? 1 : 0), 0);

export const isSolvedPuzzle = (problems: Problem[], s: State) =>
  rightCount(problems, s) === problems.length;

export const toSave = (s: State): Saved =>
  s.firstScore === null
    ? { answers: s.answers }
    : { answers: s.answers, firstScore: s.firstScore };

/**
 * The shareable result — how many landed, and which ones, never the answers.
 * Safe to send to someone who has not done this puzzle yet.
 */
export function shareGrid(
  puzzle: Puzzle,
  problems: Problem[],
  s: State,
  label: string
): string {
  const marks = problems
    .map((p, i) => (isRight(p, s.answers[i]) ? "🟩" : "⬜"))
    .join("");
  return `${label} ${puzzle.id} — ${rightCount(problems, s)}/${problems.length}\n\n${marks}`;
}
