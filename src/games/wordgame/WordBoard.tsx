"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BrandMark from "@/components/Mark";
import {
  LENGTH,
  TRIES,
  answerOf,
  backspace,
  dismissNotice,
  initialState,
  isSolved,
  keyboardMarks,
  score,
  shareGrid,
  submit,
  toSave,
  typeLetter,
  type Mark,
  type Puzzle,
  type Saved,
  type State,
} from "./engine";
import { fingerprint, loadProgress, recordResult, saveProgress, slotKey, type SaveOutcome } from "@/lib/progress";
import { printPanelsOpen, watchBrowserPrint } from "@/lib/print";
import Celebration from "@/components/Celebration";
import GUESS_WORDS from "@/data/wordgame-guesses.json";
import { SITE } from "@/lib/site";

const GAME_ID = "wordgame";

/** Built once: 4,371 words, and membership is checked on every submit. */
const LEXICON = new Set(GUESS_WORDS as string[]);
const isWord = (w: string) => LEXICON.has(w.toUpperCase());

/** Staggered row layout, so the keyboard reads as a keyboard. */
const ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

/**
 * The word game's board.
 *
 * `fingerprint` wants a grid and a key; this game has neither, so it is fed the
 * answer instead. That keeps the guarantee the fingerprint exists for — if a
 * puzzle id is ever reused for a different word, the slot changes and the old
 * save cannot restore onto it.
 */
export default function WordBoard({
  puzzle,
  onSolved,
  onNext,
}: {
  puzzle: Puzzle;
  onSolved?: (slot: string) => void;
  onNext?: () => void;
}) {
  useEffect(watchBrowserPrint, []);

  const [state, setState] = useState<State>(() => initialState(puzzle));
  /**
   * Which slot the state in hand actually belongs to. `restoring` is derived
   * from it rather than being its own flag, so switching puzzles makes this
   * true again for free — and nothing has to call setState during an effect,
   * which is both a lint error and a cascading render.
   */
  const [restoredSlot, setRestoredSlot] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [saved, setSaved] = useState<SaveOutcome | null>(null);
  const [copied, setCopied] = useState(false);
  const endedOnce = useRef(false);

  const answer = useMemo(() => answerOf(puzzle), [puzzle]);
  const slot = useMemo(
    () => slotKey(GAME_ID, puzzle.id, fingerprint([[LENGTH, TRIES]], puzzle.answer)),
    [puzzle]
  );

  const restoring = restoredSlot !== slot;

  /* restore */
  useEffect(() => {
    let alive = true;
    endedOnce.current = false;
    loadProgress<Saved>(slot).then((rec) => {
      if (!alive) return;
      setState(initialState(puzzle, rec?.entries));
      setCelebrate(false);
      setCopied(false);
      setRestoredSlot(slot);
    });
    return () => {
      alive = false;
    };
  }, [slot, puzzle]);

  /* persist — debounced, so a burst of typing is one write */
  const solved = isSolved(state);
  useEffect(() => {
    if (restoring) return;
    const id = setTimeout(() => {
      void saveProgress<Saved>(slot, GAME_ID, toSave(state), solved).then(setSaved);
    }, 400);
    return () => clearTimeout(id);
  }, [state, slot, solved, restoring]);

  /* celebrate once, and tell the picker straight away */
  useEffect(() => {
    if (solved && !endedOnce.current && !restoring) {
      endedOnce.current = true;
      setCelebrate(true);
      onSolved?.(slot);
      /* the record's copy: facts about the attempt, never the answer */
      void recordResult(slot, GAME_ID, { guesses: state.guesses.length, of: TRIES, failed: state.status === "lost" });
    }
    if (!solved) endedOnce.current = false;
  }, [solved, restoring, onSolved, slot, state.guesses.length, state.status]);

  /* a notice ("not a word") should clear itself rather than linger */
  useEffect(() => {
    if (!state.notice) return;
    const id = setTimeout(() => setState(dismissNotice), 1400);
    return () => clearTimeout(id);
  }, [state.notice]);

  const type = useCallback((ch: string) => setState((s) => typeLetter(s, ch)), []);
  const send = useCallback(() => setState((s) => submit(puzzle, s, isWord)), [puzzle]);
  const erase = useCallback(() => setState(backspace), []);

  /* physical keyboard */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) return; // never steal the email field
      const upper = e.key.toUpperCase();
      if (/^[A-Z]$/.test(upper)) {
        type(upper);
        e.preventDefault();
      } else if (e.key === "Enter") {
        send();
        e.preventDefault();
      } else if (e.key === "Backspace" || e.key === "Delete") {
        erase();
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [type, send, erase]);

  const marks = useMemo(() => keyboardMarks(puzzle, state), [puzzle, state]);
  const over = state.status !== "playing";

  const share = async () => {
    try {
      await navigator.clipboard.writeText(shareGrid(puzzle, state, SITE.name));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false); // clipboard blocked — the grid is still on screen to copy by hand
    }
  };

  /* Six rows: the ones played, the one being typed, then empties. */
  const rows: { letters: string; marks: Mark[] | null }[] = [];
  for (const g of state.guesses) rows.push({ letters: g, marks: score(answer, g) });
  if (!over) rows.push({ letters: state.current, marks: null });
  while (rows.length < TRIES) rows.push({ letters: "", marks: null });

  const label = (m: Mark | null, ch: string) =>
    !ch ? "empty" : !m ? ch : `${ch}, ${m === "hit" ? "correct" : m === "near" ? "elsewhere" : "not in the word"}`;

  return (
    <div className="sheet">
      <header>
        <div>
          <h1>Word Guessing</h1>
          <div className="titlerow">
            <span className="strapline">Six tries · five letters</span>
            <span className="pill-num">{puzzle.id.replace("WG-", "NO. ")}</span>
          </div>
        </div>
        <div className="badges">
          <BrandMark size={44} />
        </div>
      </header>

      <details className="disclosure noprint">
        <summary>
          <span className="chev" />
          How to play
        </summary>
        <div className="disclosure-body">
          <p className="intro">
            Guess the five-letter word in six tries. Every guess has to be a real word. After each
            one, a letter turns <b>filled</b> if it is in the right place, <b>outlined</b> if it is
            in the word but somewhere else, and <b>faded</b> if it is not in the word at all.
          </p>
          <p className="intro">
            Type on your keyboard or tap the letters below. <b>Enter</b> submits a guess and{" "}
            <b>Backspace</b> takes one back.
          </p>
        </div>
      </details>

      <div className="wg-wrap">
        <div className="wg-grid" role="group" aria-label="Your guesses">
          {rows.map((row, r) => (
            <div className="wg-row" key={r}>
              {Array.from({ length: LENGTH }, (_, c) => {
                const ch = row.letters[c] ?? "";
                const m = row.marks?.[c] ?? null;
                const cls = ["wg-tile", m ?? "", ch && !m ? "typed" : ""].filter(Boolean).join(" ");
                return (
                  <div className={cls} key={c} aria-label={label(m, ch)}>
                    {ch}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {celebrate && <Celebration onDone={() => setCelebrate(false)} />}
      </div>

      <div className="status" aria-live="polite">
        {state.notice
          ? state.notice
          : state.status === "won"
            ? `Got it in ${state.guesses.length} of ${TRIES}.`
            : state.status === "lost"
              ? `Out of tries — the word was ${answer}.`
              : `Guess ${state.guesses.length + 1} of ${TRIES}`}
      </div>

      <div className="wg-pad">
        {ROWS.map((row, i) => (
          <div className="wg-krow" key={i}>
            {i === 2 && (
              <button className="key wg-wide" onClick={send} disabled={over}>
                Enter
              </button>
            )}
            {[...row].map((ch) => (
              <button
                key={ch}
                className={["key", marks[ch] ?? ""].filter(Boolean).join(" ")}
                onClick={() => type(ch)}
                disabled={over}
              >
                {ch}
              </button>
            ))}
            {i === 2 && (
              <button className="key wg-wide" onClick={erase} disabled={over}>
                Back
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="tools">
        <button className="tool" onClick={share} disabled={!over}>
          {copied ? "Copied" : "Share result"}
        </button>
        <button className="tool" onClick={printPanelsOpen}>
          Print
        </button>
        <button className="tool" onClick={onNext}>
          Next puzzle
        </button>
      </div>

      {state.status === "won" && (
        <div className="win show">
          <span>Solved in {state.guesses.length}.</span>
        </div>
      )}

      <footer>
        <span>Word guessing · five letters · six tries</span>
        <span title={saved && "error" in saved ? saved.error : undefined}>
          {!saved
            ? "Guesses save automatically"
            : "error" in saved
              ? "Saved on this device — sync failed"
              : saved.where === "cloud"
                ? "Saved to your account"
                : "Saved on this device"}
        </span>
      </footer>
    </div>
  );
}
