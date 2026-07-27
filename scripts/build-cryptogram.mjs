#!/usr/bin/env node
/**
 * Builds src/data/cryptogram.json from data/cryptogram-texts.txt.
 *
 *   node scripts/build-cryptogram.mjs [--codeword <path>]
 *
 * A cryptogram is a sentence with every letter replaced by a number, and the
 * player deduces the mapping. The whole difficulty of *making* one is that a
 * short text has many valid readings: with few letters and few words, several
 * different mappings all produce real English, and a player who finds one of
 * the others is stuck through no fault of their own.
 *
 * So this script does not just encipher and hope. For each text it proves the
 * puzzle has exactly one reading, by the same argument codeword uses for its
 * grids: treat each ciphered word as a constraint over the dictionary, search
 * for consistent assignments, and stop as soon as a second one turns up. If a
 * text is ambiguous, it reveals another starter letter and tries again.
 *
 * Everything it rejects, it says why.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

const arg = process.argv.indexOf("--codeword");
const CODEWORD = resolve(
  arg > -1 ? process.argv[arg + 1] : join(homedir(), "Claude", "codeword")
);

// These two are loose pre-filters, not the real gate. The uniqueness proof
// below is what actually decides whether a text is usable; a first pass set
// these high enough to reject every proverb ever written, which is the wrong
// way round — a 45-letter line can be perfectly solvable, and the solver knows.
const MIN_LETTERS = 20; // total letters, not characters
const MIN_DISTINCT = 9; // distinct letters used
const MAX_GIVENS = 6; // past this a puzzle is being given away
const NODE_CAP = 400_000; // search budget per text, so a pathological one fails loudly

/* ── vocabulary ─────────────────────────────────────────────────────────── */

const readList = (path) =>
  !existsSync(path)
    ? []
    : readFileSync(path, "utf8")
        .split("\n")
        .map((l) => l.split("#")[0].trim().toUpperCase())
        .filter(Boolean);

/**
 * The generated lists start at three letters, so the short words every English
 * sentence is made of are missing. They are a closed set, so they are listed
 * rather than sourced.
 */
const SHORT = `A I AM AN AS AT BE BY DO GO HE IF IN IS IT ME MY NO OF ON OR SO TO UP US WE`.split(" ");

/**
 * Words the generated lists will never contain, but which real sentences do.
 *
 * Two kinds. Contractions, because an apostrophe is punctuation here and
 * carries no code, so YOU'RE reaches the solver as the letters YOURE. And
 * proper nouns, which the vocabulary excludes on purpose.
 *
 * Anything added here still has to survive the uniqueness proof — a name is
 * not a free pass, it just gives the solver a candidate it would otherwise
 * lack. Add to this list when a new text needs it; the script says which word
 * it could not find.
 */
const ALLOWED_EXTRA = `
YOURE DONT CANT WONT ISNT ARENT WASNT DIDNT DOESNT COULDNT WOULDNT SHOULDNT
ITS THATS THERES WHATS LETS IVE ILL IM YOUVE THEYRE WERE
LISA
`.trim().split(/\s+/);

const DATA = join(CODEWORD, "data");
if (!existsSync(DATA)) {
  console.error(`No codeword data at ${DATA}. Pass --codeword <path>.`);
  process.exit(1);
}
const VOCAB = new Set([
  ...readList(join(DATA, "words.txt")),
  ...readList(join(DATA, "extra-words.txt")),
  ...SHORT,
  ...ALLOWED_EXTRA,
]);

/** Words grouped by length, for the solver to draw candidates from. */
const BY_LENGTH = new Map();
for (const w of VOCAB) {
  if (!BY_LENGTH.has(w.length)) BY_LENGTH.set(w.length, []);
  BY_LENGTH.get(w.length).push(w);
}

/* ── cipher ─────────────────────────────────────────────────────────────── */

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/**
 * A derangement: no letter may be enciphered as itself. That is the classic
 * rule, and without it a puzzle can hand out free letters by accident.
 *
 * Returns `code[]` indexed by letter — code[0] is the number standing for A.
 */
function cipherFor(seed) {
  const rand = rng(seed);
  for (let attempt = 0; attempt < 200; attempt++) {
    const perm = ALPHA.map((_, i) => i);
    for (let i = perm.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    if (perm.every((v, i) => v !== i)) return perm.map((v) => v + 1);
  }
  throw new Error("could not find a derangement");
}

/* ── uniqueness ─────────────────────────────────────────────────────────── */

/**
 * `BANANA` -> `0,1,0,2,1,0`. Two sequences share a pattern exactly when one
 * could encipher to the other.
 *
 * Takes an array of tokens, not a string — the first version took a string and
 * was handed `codes.join(",")`, so it patterned over digits and commas and
 * matched nothing at all.
 */
const patternOf = (tokens) => {
  const seen = new Map();
  return tokens
    .map((t) => {
      if (!seen.has(t)) seen.set(t, seen.size);
      return seen.get(t);
    })
    .join(",");
};

/**
 * Count readings of a ciphered sentence, stopping at `limit`.
 *
 * Variables are the cipher words; each is assigned a dictionary word of the
 * same pattern. Assigning propagates into a shared code-to-letter map, which
 * must stay a bijection. Words are taken fewest-candidates-first, which is what
 * keeps this fast enough to run over every text on every build.
 */
function findReadings(cipherWords, seeded, limit = 2) {
  const candidates = cipherWords.map((codes) => {
    const pat = patternOf(codes);
    return (BY_LENGTH.get(codes.length) ?? []).filter((w) => patternOf([...w]) === pat);
  });

  let nodes = 0;
  const readings = [];
  const found = () => readings.length;
  const codeToLetter = new Map(seeded);
  const letterToCode = new Map([...seeded].map(([c, l]) => [l, c]));
  const done = new Array(cipherWords.length).fill(false);

  const fits = (codes, word) => {
    for (let i = 0; i < codes.length; i++) {
      const c = codes[i];
      const l = word[i];
      const have = codeToLetter.get(c);
      if (have !== undefined ? have !== l : letterToCode.has(l)) return false;
    }
    return true;
  };

  const search = () => {
    if (found() >= limit) return;
    if (++nodes > NODE_CAP) throw new Error("search budget exhausted");

    let pick = -1;
    let best = Infinity;
    for (let i = 0; i < cipherWords.length; i++) {
      if (done[i]) continue;
      const n = candidates[i].filter((w) => fits(cipherWords[i], w)).length;
      if (n === 0) return;
      if (n < best) {
        best = n;
        pick = i;
      }
    }
    if (pick === -1) {
      readings.push(new Map(codeToLetter));
      return;
    }

    const codes = cipherWords[pick];
    done[pick] = true;
    for (const word of candidates[pick]) {
      if (!fits(codes, word)) continue;
      const added = [];
      for (let i = 0; i < codes.length; i++) {
        if (!codeToLetter.has(codes[i])) {
          codeToLetter.set(codes[i], word[i]);
          letterToCode.set(word[i], codes[i]);
          added.push([codes[i], word[i]]);
        }
      }
      search();
      for (const [c, l] of added) {
        codeToLetter.delete(c);
        letterToCode.delete(l);
      }
      if (found() >= limit) break;
    }
    done[pick] = false;
  };

  search();
  return readings;
}

/* ── build ──────────────────────────────────────────────────────────────── */

/**
 * Read the texts, carrying the section heading down as each line's topic.
 *
 * `## Proverbs and sayings` marks everything under it, and that heading becomes
 * the hint shown beside the puzzle — enough of a nudge to make a stubborn one
 * tractable without giving anything away.
 */
const texts = [];
{
  let topic = "";
  for (const raw of readFileSync(join(process.cwd(), "data/cryptogram-texts.txt"), "utf8").split("\n")) {
    const line = raw.trim();
    if (line.startsWith("##")) {
      topic = line.replace(/^#+\s*/, "").replace(/\s*─+\s*$/, "").trim();
      continue;
    }
    if (!line || line.startsWith("#")) continue;
    texts.push({ text: line, topic });
  }
}

const seedFor = (n) => Math.imul(n + 1 + 4211, 2654435761) >>> 0;

const out = [];
const rejected = [];

texts.forEach(({ text, topic }, i) => {
  const upper = text.toUpperCase();

  if (!/^[A-Z ,'!?]+[.!?]$/.test(upper)) {
    rejected.push([text, "letters, spaces, commas and apostrophes only, ending in . ! or ?"]);
    return;
  }
  // The apostrophe carries no code, so YOU'RE reaches the solver as YOURE.
  const words = upper.replace(/[.,'!?]/g, "").split(/\s+/).filter(Boolean);
  const missing = words.filter((w) => !VOCAB.has(w));
  if (missing.length) {
    rejected.push([text, `not in the vocabulary: ${[...new Set(missing)].join(", ")}`]);
    return;
  }
  const letters = upper.replace(/[^A-Z]/g, "");
  const distinct = new Set(letters).size;
  if (letters.length < MIN_LETTERS) {
    rejected.push([text, `only ${letters.length} letters, needs ${MIN_LETTERS}`]);
    return;
  }
  if (distinct < MIN_DISTINCT) {
    rejected.push([text, `only ${distinct} distinct letters, needs ${MIN_DISTINCT}`]);
    return;
  }

  const seed = seedFor(i);
  const code = cipherFor(seed);
  const codeOf = (ch) => code[ch.charCodeAt(0) - 65];
  const cipherWords = words.map((w) => [...w].map(codeOf));
  /** code -> the letter actually behind it, for choosing honest starters */
  const trueLetterFor = new Map(ALPHA.map((ch) => [codeOf(ch), ch]));

  /**
   * Reveal letters until only one reading survives — but reveal the *right*
   * ones.
   *
   * Handing out the commonest letters is the obvious move and it barely helps:
   * ambiguity lives among the rare letters. `single step` against `single stop`
   * is the whole problem in miniature — both are English, and no amount of
   * revealing E-T-A-O-I-N settles which was meant. So each round asks the
   * solver for two readings and reveals a letter where they actually disagree,
   * which kills that alternative outright.
   *
   * The first starter is the commonest letter regardless, purely to give a
   * player somewhere to begin.
   */
  const freq = new Map();
  for (const ch of letters) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  const commonest = [...freq].sort((a, b) => b[1] - a[1])[0][0];

  const givenLetters = [commonest];
  let readings = [];
  let settled = false;

  for (let round = 0; round < MAX_GIVENS; round++) {
    const seeded = givenLetters.map((ch) => [codeOf(ch), ch]);
    try {
      readings = findReadings(cipherWords, seeded, 2);
    } catch (e) {
      rejected.push([text, String(e.message)]);
      return;
    }
    if (readings.length === 0) {
      rejected.push([text, "the intended reading is not reachable — a word is missing from the vocabulary"]);
      return;
    }
    if (readings.length === 1) {
      settled = true;
      break;
    }

    // Find a code the two readings disagree on and give away its TRUE letter.
    //
    // Not the letter either reading proposes: an alternative reading can decode
    // a code to a letter that never appears in the real sentence, and revealing
    // that points the starter at a code the puzzle does not contain.
    const [a, b] = readings;
    let wedge = null;
    for (const [c] of a) {
      if (b.get(c) !== a.get(c)) {
        wedge = trueLetterFor.get(c) ?? null;
        break;
      }
    }
    if (wedge === null || givenLetters.includes(wedge)) break; // no progress to be had
    givenLetters.push(wedge);
  }

  if (!settled) {
    rejected.push([
      text,
      `still ambiguous after ${givenLetters.length} starters (${givenLetters.join("")})`,
    ]);
    return;
  }
  const given = givenLetters;

  // The cipher ships with the puzzle rather than being re-derived from the
  // seed at play time. Two implementations of the same shuffle in two
  // languages that must agree exactly is a silent-corruption risk with no
  // upside — `key[c - 1]` is the letter standing behind code c, exactly as
  // codeword does it.
  const key = Array.from({ length: 26 }, (_, c) =>
    ALPHA[code.findIndex((v) => v === c + 1)]
  ).join("");

  out.push({
    id: `CG-${String(out.length + 1).padStart(3, "0")}`,
    text: Buffer.from(upper, "utf8").toString("base64"),
    key,
    given: given.map(codeOf).sort((a, b) => a - b),
    topic,
    added: new Date().toISOString().slice(0, 10),
  });
});

writeFileSync(
  join(process.cwd(), "src/data/cryptogram.json"),
  JSON.stringify(out, null, 1) + "\n"
);

console.log(`Accepted ${out.length} of ${texts.length} texts.`);
const starters = out.map((p) => p.given.length);
if (starters.length) {
  const avg = (starters.reduce((a, b) => a + b, 0) / starters.length).toFixed(1);
  console.log(`Starters needed for a unique reading: min ${Math.min(...starters)}, max ${Math.max(...starters)}, mean ${avg}`);
}
if (rejected.length) {
  console.log(`\nRejected ${rejected.length}:`);
  for (const [t, why] of rejected) console.log(`  ${why}\n    ${t}`);
}
