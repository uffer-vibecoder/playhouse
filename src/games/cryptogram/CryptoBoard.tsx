"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Mark from "@/components/Mark";
import {
  ALPHA,
  check,
  clear,
  codesUsed,
  dismissWrong,
  erase,
  focusCode,
  freeEntries,
  initialState,
  isSolvedPuzzle,
  lettersUsed,
  place,
  progress,
  reveal,
  step,
  wordsOf,
  type Assignment,
  type Puzzle,
  type State,
} from "./engine";
import { fingerprint, loadProgress, recordResult, saveProgress, slotKey, type SaveOutcome } from "@/lib/progress";
import { printPanelsOpen, watchBrowserPrint } from "@/lib/print";
import Celebration from "@/components/Celebration";
import TimerButton from "@/components/TimerButton";
import { useTimer } from "@/lib/use-timer";

const GAME_ID = "cryptogram";

export default function CryptoBoard({
  puzzle,
  onSolved,
  onNext,
}: {
  puzzle: Puzzle;
  onSolved?: (slot: string) => void;
  onNext?: () => void;
}) {
  useEffect(watchBrowserPrint, []);

  const words = useMemo(() => wordsOf(puzzle), [puzzle]);
  const codes = useMemo(() => codesUsed(puzzle), [puzzle]);
  const [state, setState] = useState<State>(() => initialState(puzzle));
  const [restoredSlot, setRestoredSlot] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [saved, setSaved] = useState<SaveOutcome | null>(null);
  const solvedOnce = useRef(false);

  const slot = useMemo(
    () => slotKey(GAME_ID, puzzle.id, fingerprint([[puzzle.key.length]], puzzle.key)),
    [puzzle]
  );
  const timer = useTimer(slot);
  const { stop: stopTimer, ms: elapsed } = timer;

  const restoring = restoredSlot !== slot;

  /* restore */
  useEffect(() => {
    let alive = true;
    solvedOnce.current = false;
    loadProgress<Assignment>(slot).then((rec) => {
      if (!alive) return;
      setState(initialState(puzzle, rec?.entries));
      setCelebrate(false);
      setRestoredSlot(slot);
    });
    return () => {
      alive = false;
    };
  }, [slot, puzzle]);

  /* persist */
  const solved = isSolvedPuzzle(puzzle, state);
  useEffect(() => {
    if (restoring) return;
    const id = setTimeout(() => {
      void saveProgress<Assignment>(slot, GAME_ID, freeEntries(state), solved).then(setSaved);
    }, 400);
    return () => clearTimeout(id);
  }, [state, slot, solved, restoring]);

  /* celebrate once */
  useEffect(() => {
    if (solved && !solvedOnce.current && !restoring) {
      solvedOnce.current = true;
      stopTimer();
      setCelebrate(true);
      onSolved?.(slot);
      /* the record's copy: facts about the attempt, never the answer */
      void recordResult(slot, GAME_ID, {}, elapsed);
    }
    if (!solved) solvedOnce.current = false;
  }, [solved, restoring, onSolved, slot, stopTimer, elapsed]);

  useEffect(() => {
    if (!state.wrong.size) return;
    const id = setTimeout(() => setState(dismissWrong), 1800);
    return () => clearTimeout(id);
  }, [state.wrong]);

  const type = useCallback((ch: string) => setState((s) => place(s, ch)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
      const upper = e.key.toUpperCase();
      if (/^[A-Z]$/.test(upper)) {
        setState((s) => step(puzzle, place(s, upper), 1));
      } else if (e.key === "Backspace" || e.key === "Delete") {
        setState(erase);
      } else if (e.key === "ArrowRight" || e.key === "Tab") {
        setState((s) => step(puzzle, s, e.shiftKey ? -1 : 1));
      } else if (e.key === "ArrowLeft") {
        setState((s) => step(puzzle, s, -1));
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [puzzle]);

  const used = lettersUsed(state);
  const { done, total } = progress(puzzle, state);

  return (
    <div className="sheet">
      <header>
        <div>
          <h1>Cryptogram</h1>
          <div className="titlerow">
            <span className="strapline">Every number is a letter</span>
            <span className="pill-num">{puzzle.id.replace("CG-", "NO. ")}</span>
          </div>
        </div>
        <div className="badges">
          <Mark size={44} />
        </div>
      </header>

      {puzzle.topic && (
        <div className="introrow">
          <div className="theme-tag">
            <span className="label">Hint</span>
            <span className="value">{puzzle.topic}</span>
          </div>
        </div>
      )}

      <details className="disclosure noprint">
        <summary>
          <span className="chev" />
          How to play
        </summary>
        <div className="disclosure-body">
          <p className="intro">
            A sentence has been hidden behind numbers. Each number always stands for the same
            letter, and no letter stands for itself. Tap a square and type a letter — it fills
            every square carrying that number at once.
          </p>
          <p className="intro">
            A few letters are already in to start you off. <b>Every sentence here has exactly one
            reading</b> — that is checked before a puzzle ships, so if it makes sense, it is right.
          </p>
        </div>
      </details>

      <div className="cg-wrap">
        <div className="cg-line">
          {words.map((word, w) => (
            <span className="cg-word" key={w}>
              {word.map((t, i) =>
                t.code === null ? (
                  <span className="cg-punct" key={i}>
                    {t.ch}
                  </span>
                ) : (
                  <button
                    key={i}
                    className={[
                      "cg-cell",
                      state.cursor === t.code ? "sel" : "",
                      state.locked.has(t.code) ? "given" : "",
                      state.wrong.has(t.code) ? "wrong" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => setState((s) => focusCode(s, t.code))}
                    aria-label={`Number ${t.code}, ${state.assign[t.code] ?? "blank"}`}
                  >
                    <span className="cg-ltr">{state.assign[t.code] ?? ""}</span>
                    <span className="cg-num">{t.code}</span>
                  </button>
                )
              )}
            </span>
          ))}
        </div>
        {celebrate && <Celebration onDone={() => setCelebrate(false)} />}
      </div>

      <div className="status" aria-live="polite">
        {solved ? "Solved. Every number accounted for." : `${done} of ${total} numbers filled`}
      </div>

      <div className="pad">
        {ALPHA.map((ch) => (
          <button
            key={ch}
            className={"key" + (used.has(ch) ? " used" : "")}
            onClick={() => type(ch)}
          >
            {ch}
          </button>
        ))}
        <button className="key wide" onClick={() => setState(erase)}>
          Erase
        </button>
      </div>

      <div className="tools">
        <TimerButton timer={timer} solved={solved} />
        <button className="tool" onClick={() => setState((s) => check(puzzle, s))}>
          Check
        </button>
        <button className="tool" onClick={() => setState((s) => reveal(puzzle, s))}>
          Reveal a letter
        </button>
        <button className="tool" onClick={() => setState(clear(puzzle))}>
          Clear entries
        </button>
        <button className="tool" onClick={printPanelsOpen}>
          Print
        </button>
        <button className="tool" onClick={onNext}>
          Next puzzle
        </button>
      </div>

      <details className="disclosure" open>
        <summary>
          <span className="chev" />
          Letters used
        </summary>
        <div className="disclosure-body">
          <div className="tracker">
            {ALPHA.map((ch) => (
              <div className={"tcell" + (used.has(ch) ? " used" : "")} key={ch}>
                {ch}
              </div>
            ))}
          </div>
        </div>
      </details>

      {solved && (
        <div className="win show">
          <span>Solved.</span>
        </div>
      )}

      <footer>
        <span>Cryptogram · {codes.length} letters in play</span>
        <span title={saved && "error" in saved ? saved.error : undefined}>
          {!saved
            ? "Entries save automatically"
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
