#!/usr/bin/env node
/**
 * Builds the word game's two lists from our own vocabulary.
 *
 *   node scripts/build-words.mjs [--codeword ~/Claude/codeword]
 *
 * Two lists, because they answer different questions:
 *
 *   answers  — what the game picks. Must be words anyone recognises, because a
 *              player who has never heard the answer cannot deduce it; there
 *              are no clues here. Small and hand-checked.
 *   guesses  — what the game accepts as a legal guess. Must be generous: being
 *              told a real word "is not a word" is the most irritating failure
 *              this game has, and a wrong guess costs the player a turn anyway.
 *
 * Source is ~/Claude/codeword/data. Two things about that source matter:
 *
 *   1. `blocklist.txt` and `extra-words.txt` are applied at LOAD time by
 *      codeword's src/wordlist.js, not baked into the .txt files. Reading
 *      words-common.txt directly still gives you HIDED and RICES. This script
 *      applies them, which is why it exists rather than a one-line filter.
 *   2. The hand-curation in build-wordlist.js (OBSCURE_SHORT) only applies at
 *      length <= 4. Five-letter words have had no manual pass at all, which is
 *      what REJECTED below is for.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

const arg = process.argv.indexOf("--codeword");
const CODEWORD = resolve(
  arg > -1 ? process.argv[arg + 1] : join(homedir(), "Claude", "codeword")
);
const DATA = join(CODEWORD, "data");

/** One word per line, `#` starts a comment — codeword's readList, ported. */
function readList(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .map((l) => l.split("#")[0].trim().toUpperCase())
    .filter(Boolean);
}

/**
 * Five-letter entries that clear every automatic filter and are still poor
 * answers. Reviewed by hand against the full inventory; the categories are the
 * same failures each time.
 *
 * This list is meant to grow. When a bad answer turns up in play, add it here
 * and rebuild — the same contract as codeword's data/blocklist.txt.
 */
const REJECTED = new Set([
  // comparatives and superlatives that read as typos
  "APTER", "ABLER", "NEWER", "SAFER", "DRIER", "FREER", "SORER", "SURER",
  "LATER", "FINER", "NICER", "PURER", "RARER", "RIPER", "RUDER", "TAMER",
  "WIDER", "WISER", "TRUER", "VILER", "SANER", "LAXER",
  // verbings and back-formations SCOWL builds mechanically
  "DUDED", "MIKES", "GARBS", "SNOTS", "CUBED", "DOTED", "EYING", "OUTED",
  // archaic, dialect, or vanishingly rare in modern use
  "THEEE", "WHOSO", "ANENT", "ALACK", "AVAST", "FORTH", "HENCE", "THENCE",
  // unpleasant for a game two people play at the kitchen table
  "VOMIT", "STINK", "SLIME", "PUKED", "DEATH", "DYING", "KILLS", "CORPSE",
]);

/** Suffixes that make a poor answer — a plural or past tense is a cheap word. */
const isInflected = (w) =>
  (w.endsWith("S") && !w.endsWith("SS")) || w.endsWith("ED");

function load(file) {
  const words = new Set(readList(join(DATA, file)));
  for (const w of readList(join(DATA, "extra-words.txt"))) words.add(w);
  for (const w of readList(join(DATA, "blocklist.txt"))) words.delete(w);
  return words;
}

if (!existsSync(DATA)) {
  console.error(`No codeword data at ${DATA}\nPass --codeword <path>.`);
  process.exit(1);
}

const five = (set) => [...set].filter((w) => /^[A-Z]{5}$/.test(w)).sort();

const guesses = five(load("words.txt"));
const commonFive = five(load("words-common.txt"));

const answers = commonFive.filter((w) => !isInflected(w) && !REJECTED.has(w));

// Every answer must be a legal guess, or a player typing the answer would be
// told it is not a word.
const missing = answers.filter((w) => !guesses.includes(w));
if (missing.length) {
  console.error(`Answers absent from the guess list: ${missing.join(", ")}`);
  process.exit(1);
}

writeFileSync(
  join(process.cwd(), "src/data/wordgame-guesses.json"),
  JSON.stringify(guesses) + "\n"
);
writeFileSync(
  join(process.cwd(), "src/data/wordgame-answers.json"),
  JSON.stringify(answers) + "\n"
);

/* ── the archive ─────────────────────────────────────────────────────────────
 * Append-only, and that is a hard requirement rather than a preference: a save
 * is keyed by puzzle id, so renumbering the archive would orphan every
 * half-finished game. Existing entries are read back and preserved exactly;
 * only genuinely new words are appended, in a deterministic order.
 *
 *   node scripts/build-words.mjs --add 60      appends 60 more
 *
 * Without --add the archive is left alone, so a routine rebuild of the word
 * lists cannot disturb it.
 * ── */

const ARCHIVE = join(process.cwd(), "src/data/wordgame.json");
const encode = (w) => Buffer.from(w, "utf8").toString("base64");

const existing = existsSync(ARCHIVE) ? JSON.parse(readFileSync(ARCHIVE, "utf8")) : [];
const addArg = process.argv.indexOf("--add");
const addCount = addArg > -1 ? Number(process.argv[addArg + 1]) : 0;

if (addCount > 0) {
  const used = new Set(
    existing.map((p) => Buffer.from(p.answer, "base64").toString("utf8"))
  );
  const pool = answers.filter((w) => !used.has(w));

  // Deterministic shuffle so a given pool always yields the same order — no
  // Math.random, so re-running with the same inputs is reproducible.
  let h = 0x811c9dc5;
  const rnd = () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5; h >>>= 0;
    return h / 0x100000000;
  };
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const added = new Date().toISOString().slice(0, 10);
  const next = pool.slice(0, addCount).map((w, i) => ({
    id: `WG-${String(existing.length + i + 1).padStart(3, "0")}`,
    answer: encode(w),
    added,
  }));

  if (next.length < addCount) {
    console.warn(`Only ${next.length} unused answers left; asked for ${addCount}.`);
  }
  writeFileSync(ARCHIVE, JSON.stringify([...existing, ...next], null, 1) + "\n");
  console.log(`\narchive  ${existing.length} + ${next.length} = ${existing.length + next.length} puzzles`);
} else if (existing.length) {
  console.log(`\narchive  ${existing.length} puzzles (unchanged — pass --add <n> to extend)`);
}

console.log(`guesses  ${guesses.length.toLocaleString().padStart(6)}  (words.txt, 5 letters)`);
console.log(`common   ${commonFive.length.toLocaleString().padStart(6)}  (words-common.txt, 5 letters)`);
console.log(`answers  ${answers.length.toLocaleString().padStart(6)}  after dropping inflections and ${REJECTED.size} rejected`);
console.log(`\nsample: ${answers.filter((_, i) => i % Math.floor(answers.length / 30) === 0).slice(0, 30).join(" ")}`);
