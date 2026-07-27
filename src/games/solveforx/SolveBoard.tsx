"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  render,
  rightCount,
  shareGrid,
  step,
  toSave,
  toggleSign,
  typeDigit,
  type Puzzle,
  type Saved,
  type State,
} from "./engine";
import { fingerprint, loadProgress, saveProgress, slotKey, type SaveOutcome } from "@/lib/progress";
import { printPanelsOpen, watchBrowserPrint } from "@/lib/print";
import Celebration from "@/components/Celebration";
import { SITE } from "@/lib/site";

const GAME_ID = "solveforx";

const KEYS = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "−", "0", "⌫"];

export default function SolveBoard({
  puzzle,
  onSolved,
}: {
  puzzle: Puzzle;
  onSolved?: (slot: string) => void;
}) {
  useEffect(watchBrowserPrint, []);

  const problems = useMemo(() => generate(puzzle), [puzzle]);
  const [state, setState] = useState<State>(() => initialState());
  const [restoredSlot, setRestoredSlot] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [saved, setSaved] = useState<SaveOutcome | null>(null);
  const [checked, setChecked] = useState(false);
  const [copied, setCopied] = useState(false);
  const solvedOnce = useRef(false);

  // The seed is the whole puzzle, so it is what the fingerprint guards: reuse
  // an id for a different seed and the slot changes, as it should.
  const slot = useMemo(
    () => slotKey(GAME_ID, puzzle.id, fingerprint([[puzzle.seed]], String(puzzle.seed))),
    [puzzle]
  );
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
      setCelebrate(true);
      onSolved?.(slot);
    }
    if (!solved) solvedOnce.current = false;
  }, [solved, restoring, onSolved, slot]);

  /* marks fade rather than lingering over a row being corrected */
  useEffect(() => {
    if (!state.wrong.size) return;
    const id = setTimeout(() => setState(dismissWrong), 2200);
    return () => clearTimeout(id);
  }, [state.wrong]);

  const press = useCallback((k: string) => {
    if (k === "⌫") setState(backspace);
    else if (k === "−") setState(toggleSign);
    else setState((s) => typeDigit(s, k));
  }, []);

  /* physical keyboard */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
      if (/^\d$/.test(e.key)) {
        setState((s) => typeDigit(s, e.key));
      } else if (e.key === "-") {
        setState(toggleSign);
      } else if (e.key === "Backspace" || e.key === "Delete") {
        setState(backspace);
      } else if (e.key === "ArrowDown" || e.key === "Enter") {
        setState((s) => step(s, 1));
      } else if (e.key === "ArrowUp") {
        setState((s) => step(s, -1));
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const runCheck = () => {
    setChecked(true);
    setState((s) => check(problems, s));
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
          <h1>Solve for x</h1>
          <div className="strapline">Ten to work through</div>
        </div>
        <div className="badges">
          <span className="pill-no">{puzzle.id.replace("SX-", "NO. ")}</span>
        </div>
      </header>

      <details className="disclosure noprint">
        <summary>
          <span className="chev" />
          How to play
        </summary>
        <div className="disclosure-body">
          <p className="intro">
            Work out what <b>x</b> has to be for each equation to balance. Tap a line, then type
            your answer — every answer is a whole number, so nothing here needs a fraction.
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
                  <span className="sx-eq">{render(p)}</span>
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

      <div className="sx-pad">
        {KEYS.map((k) => (
          <button key={k} className="key" onClick={() => press(k)}>
            {k}
          </button>
        ))}
      </div>

      <div className="tools">
        <button className="tool" onClick={runCheck}>
          Check
        </button>
        <button
          className="tool"
          onClick={() => {
            setState(clear());
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
      </div>

      {solved && (
        <div className="win show">
          <span>All ten solved.</span>
        </div>
      )}

      <footer>
        <span>Solve for x · ten equations · whole numbers only</span>
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
