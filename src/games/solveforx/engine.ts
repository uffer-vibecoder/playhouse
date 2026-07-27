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

export type Tier = "easy" | "medium" | "hard";

export type Puzzle = {
  id: string;
  /** Everything about the puzzle, in one integer. */
  seed: number;
  /**
   * Absent means easy, and that is load-bearing rather than a convenience.
   * The first 120 sets shipped without this field and their problems are
   * derived from the seed, so any change to how an easy set is generated would
   * put different equations behind an id someone has already answered. Absent
   * dispatches to exactly the code that produced them.
   */
  tier?: Tier;
  added?: string;
};

/** `a·x op b = c`, where `op` is absent for the one-step multiply/divide forms. */
export type EasyForm = "add" | "sub" | "mul" | "div" | "mul-add" | "mul-sub";

/**
 * The multi-step shapes, taken from the worksheet: like terms on one side, the
 * constant on the left, distribution over a sum or a difference, distribution
 * with an outer term, collected constants, and the variable on both sides.
 */
export type MediumForm =
  | "like-terms"
  | "flip"
  | "dist-sum"
  | "dist-diff"
  | "dist-outer"
  | "collect"
  | "both-sides";

/** The hard tier's axis is fractions rather than more steps. */
export type HardForm = "over" | "minus-over" | "frac-coef" | "frac-outer" | "steep";

export type Form = EasyForm | MediumForm | HardForm;

export type Problem = {
  form: Form;
  a: number;
  b: number;
  c: number;
  /** further coefficients, for the shapes that need them */
  d?: number;
  e?: number;
  /** the letter standing in for the unknown; absent means `x` */
  v?: string;
  /**
   * The answer as an exact fraction, for the tiers whose answers are not whole.
   * Present only on those — an easy problem is byte-identical to what it was
   * before this existed, which is what stops 120 shipped sets from moving.
   */
  n?: number;
  q?: number;
  /** The answer as a number. Whole on the easy tier by construction. */
  x: number;
};

/* ── exact fractions ──────────────────────────────────────────────────────
   Answers on the harder tiers are rational, so they are carried as a
   numerator and a denominator and never as a float. Two reasons, and the
   second is the one that bites: floating point would make `1/3` a repeating
   binary fraction that is already wrong before anyone is asked to round it,
   and the tolerance check below compares against the exact value — round once
   in the generator and again in the comparison and an answer that is right
   gets marked wrong.
── */

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));

/** A coefficient in lowest terms, so `6/4` is shown as `3/2` and never as itself. */
function reduce(a: number, b: number): [number, number] {
  const g = gcd(Math.abs(a), b) || 1;
  return [a / g, b / g];
}

/** Reduce, and keep the sign in the numerator so rendering never sees `1/-3`. */
function frac(n: number, q: number): { n: number; q: number } {
  if (q < 0) { n = -n; q = -q; }
  const g = gcd(n, q) || 1;
  return { n: n / g, q: q / g };
}

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

const ONE_STEP: EasyForm[] = ["add", "sub", "mul", "div"];
const TWO_STEP: EasyForm[] = ["mul-add", "mul-sub"];

/** The worksheet varies the letter, so we do too. `x` stays the commonest. */
const LETTERS = ["x", "k", "b", "c", "n", "p", "z", "s", "v", "r", "y", "h"];

/**
 * Ten problems, easing from one step to two.
 *
 * Every form is built forwards — pick the answer, then construct the equation
 * around it — so the answer is an integer by construction rather than by
 * filtering. That is also why division never produces a fraction: `x` is made
 * as `a · c`, so `x ÷ a` is exact.
 */
export function generate(puzzle: Puzzle): Problem[] {
  if (puzzle.tier === "medium") return generateMedium(puzzle.seed);
  if (puzzle.tier === "hard") return generateHard(puzzle.seed);
  return generateEasy(puzzle.seed);
}

/**
 * The original tier, untouched.
 *
 * This function is a promise to 120 shipped sets: the archive stores a seed and
 * nothing else, so editing anything in here changes the equations behind ids
 * people have already answered, and their saved answers would restore onto
 * problems that no longer exist. `test/solveforx.test.ts` holds a snapshot of
 * all 1200 equations to make that failure loud rather than silent.
 */
function generateEasy(seed: number): Problem[] {
  const rand = rng(seed);
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

/* ── the harder tiers ─────────────────────────────────────────────────────
   These cannot be built forwards the way the easy tier is. There, an answer is
   chosen first and the equation assembled around it, which makes whole answers
   free. Here the coefficients come first and the answer falls out of them, so
   it is rational far more often than not — which is exactly what the reference
   worksheets do, and why they say to round to the nearest hundredth.

   So: draw the coefficients, solve exactly with integer arithmetic, and reject
   any draw where the variable cancels out entirely and there is nothing left
   to solve.
── */

/** Coefficients away from zero, since a zero coefficient deletes the term. */
function nonZero(between: (lo: number, hi: number) => number, lo: number, hi: number): number {
  for (;;) {
    const v = between(lo, hi);
    if (v !== 0) return v;
  }
}

/** For a divisor: ±1 divides nothing and reads as a mistake on the page. */
function awayFromOne(between: (lo: number, hi: number) => number, lo: number, hi: number): number {
  for (;;) {
    const v = between(lo, hi);
    if (Math.abs(v) >= 2) return v;
  }
}

function generateMedium(seed: number): Problem[] {
  const rand = rng(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const between = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const forms: MediumForm[] = [
    "like-terms", "flip", "dist-sum", "dist-diff", "dist-outer", "collect", "both-sides",
  ];

  const out: Problem[] = [];
  while (out.length < PROBLEMS) {
    const form = pick(forms);
    const v = pick(LETTERS);
    let a = 0, b = 0, c = 0, d = 0, e = 0;
    let num = 0, den = 0;

    switch (form) {
      case "like-terms": {
        // a·v + b + c·v = d
        a = nonZero(between, -9, 9);
        c = nonZero(between, -9, 9);
        if (a + c === 0) continue; // the variable cancels — nothing to solve
        b = nonZero(between, -12, 12);
        d = between(-30, 30);
        num = d - b; den = a + c;
        break;
      }
      case "flip": {
        // c = a·v + b·v, the constant on the left
        a = nonZero(between, -9, 9);
        b = nonZero(between, -9, 9);
        if (a + b === 0) continue;
        c = nonZero(between, -30, 30);
        num = c; den = a + b;
        break;
      }
      case "dist-sum": {
        // a(b + c·v) = d
        a = nonZero(between, -9, 9);
        c = nonZero(between, -9, 9);
        b = nonZero(between, -9, 9);
        d = between(-40, 40);
        num = d - a * b; den = a * c;
        break;
      }
      case "dist-diff": {
        // a(b·v − c) = d
        a = nonZero(between, -9, 9);
        b = nonZero(between, -9, 9);
        c = nonZero(between, -9, 9);
        d = between(-40, 40);
        num = d + a * c; den = a * b;
        break;
      }
      case "dist-outer": {
        // d = b + a(v − c)
        a = nonZero(between, -9, 9);
        b = nonZero(between, -12, 12);
        c = nonZero(between, -9, 9);
        d = between(-40, 40);
        num = d - b + a * c; den = a;
        break;
      }
      case "collect": {
        // a·v + b + c = d
        a = nonZero(between, -9, 9);
        b = nonZero(between, -12, 12);
        c = nonZero(between, -12, 12);
        d = between(-30, 30);
        num = d - b - c; den = a;
        break;
      }
      case "both-sides": {
        // a(b·v + c) = d + e·v
        a = nonZero(between, -6, 6);
        b = nonZero(between, -6, 6);
        c = nonZero(between, -9, 9);
        d = between(-30, 30);
        e = nonZero(between, -9, 9);
        if (a * b - e === 0) continue; // the variable cancels
        num = d - a * c; den = a * b - e;
        break;
      }
    }

    const f = frac(num, den);
    out.push({ form, a, b, c, d, e, v, n: f.n, q: f.q, x: f.n / f.q });
  }
  return out;
}

function generateHard(seed: number): Problem[] {
  const rand = rng(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const between = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const forms: HardForm[] = ["over", "over", "minus-over", "frac-coef", "frac-outer", "steep"];

  const out: Problem[] = [];
  while (out.length < PROBLEMS) {
    const form = pick(forms);
    const v = pick(LETTERS);
    let a = 0, b = 0, c = 0, d = 0;
    let num = 0, den = 0;

    switch (form) {
      case "over": {
        // (b + v) / a = c. |a| ≥ 2: dividing by one is not a division, and
        // `(9 + r) ÷ 1 = −5` is a worse puzzle than the same thing without it.
        a = awayFromOne(between, -15, 15);
        b = nonZero(between, -30, 30);
        c = nonZero(between, -20, 20);
        num = a * c - b; den = 1;
        break;
      }
      case "minus-over": {
        // (b − v) / a = c
        a = awayFromOne(between, -12, 12);
        b = nonZero(between, -30, 30);
        c = nonZero(between, -20, 20);
        num = b - a * c; den = 1;
        break;
      }
      case "frac-coef": {
        // (a/b)·v − c = d
        a = nonZero(between, -9, 9);
        b = between(2, 12);
        // The coefficient has to still be a fraction once reduced. Testing
        // `|a| === b` only caught 2/2 and let `(9/3)c` through, which is 3c
        // wearing a costume.
        if (b % Math.abs(a) === 0 || gcd(Math.abs(a), b) === b) continue;
        [a, b] = reduce(a, b);
        c = nonZero(between, -30, 30);
        d = between(-30, 30);
        num = (d + c) * b; den = a;
        break;
      }
      case "frac-outer": {
        // c + (a/b)·v = d
        a = nonZero(between, -9, 9);
        b = between(2, 12);
        if (b % Math.abs(a) === 0 || gcd(Math.abs(a), b) === b) continue;
        [a, b] = reduce(a, b);
        c = nonZero(between, -20, 20);
        d = between(-30, 30);
        num = (d - c) * b; den = a;
        break;
      }
      case "steep": {
        // a·v − b = c, with coefficients steep enough to rarely divide out
        a = nonZero(between, -30, 30);
        b = nonZero(between, -30, 30);
        c = between(-30, 30);
        num = c + b; den = a;
        break;
      }
    }

    const f = frac(num, den);
    out.push({ form, a, b, c, d, v, n: f.n, q: f.q, x: f.n / f.q });
  }
  return out;
}

/* ── how an equation reads ────────────────────────────────────────────────
   `render` is the flat string: the accessible label, the test's fixture, the
   thing you can paste into a message. `renderPieces` is the same equation cut
   into parts so the board can stack a fraction properly, because `(20 + v)/15`
   set inline stops looking like division and starts looking like a typo.
── */

/**
 * Signs are folded into the operator, never left doubled up.
 *
 * Coefficients here are drawn from a range that includes negatives, so the
 * naive `${a} + ${b}` produces `−11 + −5(h − −2)`. That is not how anyone
 * writes it, and on a worksheet it reads as a typo rather than as arithmetic.
 * Every following term therefore goes through one of the `signed*` helpers,
 * which choose the operator from the sign and print the magnitude.
 */

/** A bare number, with a proper minus rather than a hyphen. */
const num = (n: number) => (n < 0 ? `−${Math.abs(n)}` : `${n}`);

/** A leading term: `x`, `−x`, `3x`, `−3x`. */
const term = (co: number, v: string) =>
  co === 1 ? v : co === -1 ? `−${v}` : `${co < 0 ? "−" : ""}${Math.abs(co)}${v}`;

/** A following constant: ` + 5` or ` − 5`. */
const trail = (n: number) => (n < 0 ? ` − ${Math.abs(n)}` : ` + ${n}`);

/** A following term in the unknown: ` + 3x` or ` − 3x`. */
const trailTerm = (co: number, v: string) =>
  co < 0 ? ` − ${term(-co, v)}` : ` + ${term(co, v)}`;

/** A following coefficient about to multiply a bracket: ` + 5(` or ` − 5(`. */
const trailCoef = (co: number) => (co < 0 ? ` − ${Math.abs(co)}` : ` + ${co}`);

/** The equation as a reader sees it. */
export function render(p: Problem): string {
  const v = p.v ?? "x";
  const d = p.d ?? 0;
  const e = p.e ?? 0;
  switch (p.form) {
    case "like-terms":
      return `${term(p.a, v)}${trail(p.b)}${trailTerm(p.c, v)} = ${num(d)}`;
    case "flip":
      return `${num(p.c)} = ${term(p.a, v)}${trailTerm(p.b, v)}`;
    case "dist-sum":
      return `${num(p.a)}(${num(p.b)}${trailTerm(p.c, v)}) = ${num(d)}`;
    case "dist-diff":
      return `${num(p.a)}(${term(p.b, v)}${trail(-p.c)}) = ${num(d)}`;
    case "dist-outer":
      return `${num(d)} = ${num(p.b)}${trailCoef(p.a)}(${v}${trail(-p.c)})`;
    case "collect":
      return `${term(p.a, v)}${trail(p.b)}${trail(p.c)} = ${num(d)}`;
    case "both-sides":
      return `${num(p.a)}(${term(p.b, v)}${trail(p.c)}) = ${num(d)}${trailTerm(e, v)}`;
    case "over":
      return `(${num(p.b)} + ${v}) ÷ ${num(p.a)} = ${num(p.c)}`;
    case "minus-over":
      return `(${num(p.b)} − ${v}) ÷ ${num(p.a)} = ${num(p.c)}`;
    case "frac-coef":
      return `${p.a < 0 ? "−" : ""}(${Math.abs(p.a)}/${p.b})${v}${trail(-p.c)} = ${num(d)}`;
    case "frac-outer":
      return `${num(p.c)}${p.a < 0 ? " − " : " + "}(${Math.abs(p.a)}/${p.b})${v} = ${num(d)}`;
    case "steep":
      return `${term(p.a, v)}${trail(-p.b)} = ${num(p.c)}`;
  }
  return renderEasy(p);
}

function renderEasy(p: Problem): string {
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
    default:
      return "";
  }
}

/**
 * One equation, cut into inline text and stacked fractions.
 *
 * Only the hard tier ever produces a `frac`; everything else is a single text
 * piece, so the board can render this uniformly without knowing about tiers.
 */
export type Piece =
  | { kind: "text"; text: string }
  | { kind: "frac"; over: string; under: string };

export function renderPieces(p: Problem): Piece[] {
  const v = p.v ?? "x";
  const d = p.d ?? 0;
  switch (p.form) {
    case "over":
      return [
        { kind: "frac", over: `${num(p.b)} + ${v}`, under: num(p.a) },
        { kind: "text", text: ` = ${num(p.c)}` },
      ];
    case "minus-over":
      return [
        { kind: "frac", over: `${num(p.b)} − ${v}`, under: num(p.a) },
        { kind: "text", text: ` = ${num(p.c)}` },
      ];
    case "frac-coef":
      return [
        ...(p.a < 0 ? [{ kind: "text" as const, text: "−" }] : []),
        { kind: "frac", over: `${Math.abs(p.a)}`, under: `${p.b}` },
        { kind: "text", text: `${v}${trail(-p.c)} = ${num(d)}` },
      ];
    case "frac-outer":
      return [
        { kind: "text", text: `${num(p.c)}${p.a < 0 ? " − " : " + "}` },
        { kind: "frac", over: `${Math.abs(p.a)}`, under: `${p.b}` },
        { kind: "text", text: `${v} = ${num(d)}` },
      ];
    default:
      return [{ kind: "text", text: render(p) }];
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
    // Decimals have to survive a reload. The guard was `/^-?\d{0,4}$/` when
    // every answer was whole, and left as it was it would silently drop every
    // answer on the two new tiers — the puzzle would look untouched.
    return typeof v === "string" && /^-?\d{0,4}(\.\d{0,2})?$/.test(v) ? v : "";
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
  const dot = cur.indexOf(".");
  // Two places after the point and no more: the worksheets say to round to the
  // nearest hundredth, so a third digit is not a more precise answer, it is a
  // misreading of the instruction.
  if (dot >= 0 && cur.length - dot > 2) return s;
  if (dot < 0 && cur.replace("-", "").length >= 4) return s;
  return { ...s, answers: replace(s.answers, s.cursor, cur + d), wrong: new Set() };
}

/**
 * The decimal point, which only the harder tiers need.
 *
 * One per answer, and never leading — `.5` is a real way to write a half but it
 * reads as a smudge at this size, so the point has to follow a digit.
 */
export function typePoint(s: State): State {
  const cur = s.answers[s.cursor] ?? "";
  if (cur.includes(".") || cur === "" || cur === "-") return s;
  return { ...s, answers: replace(s.answers, s.cursor, cur + "."), wrong: new Set() };
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

/**
 * Half a hundredth, which is what "round to the nearest hundredth" has to mean
 * if it is guidance rather than a trap.
 *
 * A third is the case that settles the size: `0.33` and `0.333` are both
 * correct roundings of the same number and both must pass, while `0.34` is a
 * different number and must not. Half of 0.01 accepts the first two and
 * refuses the third. The tiny epsilon is for binary representation only —
 * without it a value sitting exactly on the boundary can fail by 1e-16.
 */
const TOLERANCE = 0.005 + 1e-9;

/**
 * Is this answer right?
 *
 * Two paths, deliberately. A problem with no exact fraction attached is from
 * the easy tier, where every answer is a whole number by construction, and it
 * keeps the exact integer comparison it has always had — a tolerance there
 * would start accepting `4.001` for `4`. Only the tiers whose answers are
 * genuinely rational are compared loosely, and they are compared against the
 * exact value rather than against a rounded one, because rounding in the
 * generator and again here is how an answer that is right gets marked wrong.
 */
export function isRight(p: Problem, answer: string): boolean {
  const a = answer.trim();
  if (a === "" || a === "-" || a === "." || a === "-.") return false;
  const v = Number(a);
  if (!Number.isFinite(v)) return false;
  if (p.q === undefined || p.n === undefined) return v === p.x;
  return Math.abs(v * p.q - p.n) <= TOLERANCE * Math.abs(p.q);
}

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
