"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Mark from "@/components/Mark";
import {
  PROBLEMS,
  backspace,
  check,
  clear,
  dismissWrong,
  generate,
  initialState,
  isRight,
  isSolvedPuzzle,
  moveTo,
  recordFirstScore,
  render,
  renderPieces,
  rightCount,
  shareGrid,
  step,
  toSave,
  toggleSign,
  typeDigit,
  typePoint,
  type Puzzle,
  type Saved,
  type State,
} from "./engine";
import { loadProgress, recordResult, saveProgress, type SaveOutcome } from "@/lib/progress";
import { solveforxSlot } from "@/lib/slots";
import { printPanelsOpen, watchBrowserPrint } from "@/lib/print";
import Celebration from "@/components/Celebration";
import TimerButton from "@/components/TimerButton";
import { useTimer } from "@/lib/use-timer";
import Scratch from "./Scratch";
import Calculator from "./Calculator";
import { SITE } from "@/lib/site";

const GAME_ID = "solveforx";

const KEYS = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "−", "0", "⌫"];

/**
 * The harder tiers answer to the hundredth, so they need a point. The easy tier
 * does not, and showing one there would suggest its answers might not be whole
 * — every one of them is, by construction.
 */
const KEYS_DECIMAL = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "−", "0", ".", "⌫"];

export default function SolveBoard({
  puzzle,
  onSolved,
  onNext,
}: {
  puzzle: Puzzle;
  onSolved?: (slot: string) => void;
  onNext?: () => void;
}) {
  useEffect(watchBrowserPrint, []);

  const problems = useMemo(() => generate(puzzle), [puzzle]);
  const [state, setState] = useState<State>(() => initialState());
  const [restoredSlot, setRestoredSlot] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [saved, setSaved] = useState<SaveOutcome | null>(null);
  const [checked, setChecked] = useState(false);
  const [copied, setCopied] = useState(false);
  /** How far the check has swept down the page, and what it found. */
  const [sweep, setSweep] = useState(0);
  const [tally, setTally] = useState<{ right: number; answered: number } | null>(null);
  const solvedOnce = useRef(false);

  // The seed is the whole puzzle, so it is what the fingerprint guards: reuse
  // an id for a different seed and the slot changes, as it should.
  const slot = useMemo(
    () => solveforxSlot(puzzle),
    [puzzle]
  );
  const timer = useTimer(slot);
  const { stop: stopTimer, ms: elapsed } = timer;

  const restoring = restoredSlot !== slot;

  /* restore */
  useEffect(() => {
    let alive = true;
    solvedOnce.current = false;
    loadProgress<Saved>(slot).then((rec) => {
      if (!alive) return;
      setState(initialState(rec?.entries));
      setCelebrate(false);
      setChecked(false);
      setCopied(false);
      setRestoredSlot(slot);
    });
    return () => {
      alive = false;
    };
  }, [slot]);

  /* persist */
  const solved = isSolvedPuzzle(problems, state);
  useEffect(() => {
    if (restoring) return;
    const id = setTimeout(() => {
      void saveProgress<Saved>(slot, GAME_ID, toSave(state), solved).then(setSaved);
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
      /* The record's copy: facts about the attempt, never the answer. The
         first attempt's score is what the record averages — and the row is
         insert-if-absent, so a replay cannot overwrite it either. */
      void recordResult(slot, GAME_ID, {
        score: state.firstScore ?? rightCount(problems, state),
        of: problems.length,
      }, elapsed);
    }
    if (!solved) solvedOnce.current = false;
  }, [solved, restoring, onSolved, slot, problems, state, stopTimer, elapsed]);

  /* marks fade rather than lingering over a row being corrected */
  useEffect(() => {
    if (!state.wrong.size) return;
    const id = setTimeout(() => setState(dismissWrong), 2200);
    return () => clearTimeout(id);
  }, [state.wrong]);

  /**
   * Every edit goes through here, and every edit closes off the first attempt
   * once all ten rows carry an answer.
   *
   * Recording it as part of the edit rather than in an effect watching the
   * answers keeps it pure, and means no entry path can forget — there are two
   * of them, the keypad and the physical keyboard.
   */
  const edit = useCallback(
    (fn: (s: State) => State) => setState((s) => recordFirstScore(problems, fn(s))),
    [problems]
  );

  const press = useCallback(
    (k: string) =>
      edit((s) =>
        k === "⌫" ? backspace(s)
        : k === "−" ? toggleSign(s)
        : k === "." ? typePoint(s)
        : typeDigit(s, k)
      ),
    [edit]
  );

  /* physical keyboard */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
      if (/^\d$/.test(e.key)) {
        edit((s) => typeDigit(s, e.key));
      } else if (e.key === "-") {
        edit(toggleSign);
      } else if (e.key === "." || e.key === ",") {
        // a comma too: on several keyboard layouts that is the decimal key, and
        // silently ignoring it looks like the field is broken
        edit(typePoint);
      } else if (e.key === "Backspace" || e.key === "Delete") {
        edit(backspace);
      } else if (e.key === "ArrowDown" || e.key === "Enter") {
        setState((s) => step(s, 1));
      } else if (e.key === "ArrowUp") {
        setState((s) => step(s, -1));
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [edit]);

  /**
   * Check, with something happening.
   *
   * It used to mark the wrong rows and nothing else — which is the information,
   * but it arrives silently and reads as though the button might not have done
   * anything. Now the right rows land one after another rather than all at once,
   * and a line says the count. The stagger is 60ms a row: enough to read as a
   * sweep down the page, short enough that ten rows are done in half a second.
   */
  const runCheck = () => {
    setChecked(true);
    setState((s) => check(problems, s));
    const right = problems.filter((p, i) => isRight(p, state.answers[i])).length;
    const answered = state.answers.filter((a) => a.trim() !== "").length;
    setTally({ right, answered });
    setSweep(0);
    problems.forEach((_, i) => setTimeout(() => setSweep(i + 1), 60 * (i + 1)));
    setTimeout(() => setTally(null), 4000);
  };

  const share = async () => {
    try {
      await navigator.clipboard.writeText(shareGrid(puzzle, problems, state, SITE.name));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const filled = state.answers.filter((a) => a.trim() !== "").length;

  return (
    <div className="sheet">
      <header>
        <div>
          <h1>Solve for X</h1>
          <div className="titlerow">
            <span className="strapline">Ten to work through</span>
            <span className="pill-num">{puzzle.id.replace("SX-", "NO. ")}</span>
          </div>
        </div>
        <div className="badges">
          <Mark size={44} />
        </div>
      </header>

      <details className="disclosure noprint">
        <summary>
          <span className="chev" />
          How to play
        </summary>
        <div className="disclosure-body">
          <p className="intro">
            Work out what the letter has to be for each equation to balance. Tap a line, then
            type your answer.{" "}
            {puzzle.tier
              ? "Answers here are not always whole — round to the nearest hundredth when one is not, and 0.33 or 0.333 will both do for a third."
              : "Every answer is a whole number, so nothing here needs a fraction."}
          </p>
          <p className="intro">
            <b>Check</b> marks anything that is answered but not right yet, and leaves blanks
            alone. Arrow keys move between lines.
          </p>
        </div>
      </details>

      <div className="sx-wrap">
        <ol className="sx-list">
          {problems.map((p, i) => {
            const cls = [
              "sx-row",
              state.wrong.has(i) ? "wrong" : "",
              checked && isRight(p, state.answers[i]) ? "right" : "",
              checked && i < sweep ? "swept" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <li key={i}>
                <button
                  className={cls}
                  aria-current={i === state.cursor ? "true" : undefined}
                  onClick={() => setState((s) => moveTo(s, i))}
                >
                  <span className="sx-n">{i + 1}</span>
                  <span className="sx-eq" aria-label={render(p)}>
                    {/* stacked rather than inline: `(20 + v)/15` set on one
                        line stops reading as division and starts reading as a
                        typo. The flat form goes on aria-label, so a screen
                        reader still hears one sentence. */}
                    {renderPieces(p).map((piece, k) =>
                      piece.kind === "text" ? (
                        <span key={k}>{piece.text}</span>
                      ) : (
                        <span className="sx-frac" key={k}>
                          <span className="sx-over">{piece.over}</span>
                          <span className="sx-under">{piece.under}</span>
                        </span>
                      )
                    )}
                  </span>
                  <span className="sx-ans">
                    {state.answers[i] || <span className="sx-hint">x</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        {celebrate && <Celebration onDone={() => setCelebrate(false)} />}
      </div>

      <div className="status" aria-live="polite">
        {solved
          ? "All ten. Nicely done."
          : checked
            ? `${rightCount(problems, state)} of ${PROBLEMS} right so far`
            : `${filled} of ${PROBLEMS} answered`}
      </div>

      {tally && (
        <p className="sx-tally" role="status">
          {tally.answered === 0
            ? "Nothing to check yet."
            : tally.right === problems.length
              ? "All ten."
              : `${tally.right} of ${tally.answered} answered ${tally.right === 1 ? "is" : "are"} right.`}
        </p>
      )}

      <div className="sx-pad">
        {(puzzle.tier ? KEYS_DECIMAL : KEYS).map((k) => (
          <button
            key={k}
            /* thirteen keys in three columns leaves the backspace alone on a
               row looking like a mistake; it spans instead */
            className={"key" + (k === "⌫" && puzzle.tier ? " sx-wide" : "")}
            onClick={() => press(k)}
          >
            {k}
          </button>
        ))}
      </div>

      {/* Both belong to the harder tiers: the easy one is a line of mental
          arithmetic and a canvas under it would be clutter. */}
      {puzzle.tier && (
        <>
          <Scratch problem={render(problems[state.cursor])} />
          <Calculator />
        </>
      )}

      <div className="tools">
        <TimerButton timer={timer} solved={solved} />
        <button className="tool" onClick={runCheck}>
          Check
        </button>
        <button
          className="tool"
          onClick={() => {
            setState((st) => clear(st));
            setChecked(false);
          }}
        >
          Clear
        </button>
        <button className="tool" onClick={share} disabled={!checked && !solved}>
          {copied ? "Copied" : "Share result"}
        </button>
        <button className="tool" onClick={printPanelsOpen}>
          Print
        </button>
        <button className="tool" onClick={onNext}>
          Next puzzle
        </button>
      </div>

      {solved && (
        <div className="win show">
          <span>All ten solved.</span>
        </div>
      )}

      <footer>
        {/* "whole numbers only" was true of the only tier that existed when it
            was written, and false the moment the harder two shipped. */}
        <span>
          Solve for x · ten equations ·{" "}
          {puzzle.tier ? "round to the nearest hundredth" : "whole numbers only"}
        </span>
        <span title={saved && "error" in saved ? saved.error : undefined}>
          {!saved
            ? "Answers save automatically"
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
