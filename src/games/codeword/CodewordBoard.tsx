"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ALPHA,
  buildSlots,
  check,
  clear,
  codeAt,
  currentRun,
  erase,
  focusCell,
  focusCode,
  freeEntries,
  initialState,
  isSolvedPuzzle,
  lettersUsed,
  nextWordCell,
  place,
  reveal,
  step,
  toggleDir,
  type Puzzle,
  type State,
} from "./engine";
import { fingerprint, loadProgress, saveProgress, slotKey, type SaveOutcome } from "@/lib/progress";
import Celebration from "./Celebration";

const GAME_ID = "codeword";

export default function CodewordBoard({
  puzzle,
  onSolved,
}: {
  puzzle: Puzzle;
  onSolved?: (slot: string) => void;
}) {
  const slots = useMemo(() => buildSlots(puzzle), [puzzle]);
  const [state, setState] = useState<State>(() => initialState(puzzle, slots));
  const [restoring, setRestoring] = useState(true);
  const [celebrate, setCelebrate] = useState(false);
  const [saved, setSaved] = useState<SaveOutcome | null>(null);
  const solvedOnce = useRef(false);

  const slot = useMemo(
    () => slotKey(GAME_ID, puzzle.id, fingerprint(puzzle.grid, puzzle.key)),
    [puzzle]
  );

  /* restore ------------------------------------------------------------- */
  useEffect(() => {
    let alive = true;
    solvedOnce.current = false;
    loadProgress(slot).then((rec) => {
      if (!alive) return;
      setState(initialState(puzzle, slots, rec?.entries));
      setCelebrate(false);
      setRestoring(false);
    });
    return () => {
      alive = false;
    };
  }, [slot, puzzle, slots]);

  /* persist ------------------------------------------------------------- */
  const solved = isSolvedPuzzle(puzzle, state);
  useEffect(() => {
    if (restoring) return;
    const id = setTimeout(() => {
      void saveProgress(slot, GAME_ID, freeEntries(state), solved).then(setSaved);
    }, 400); // debounce: typing a word should not be a write per letter
    return () => clearTimeout(id);
  }, [state, slot, solved, restoring]);

  /* celebrate once ------------------------------------------------------ */
  useEffect(() => {
    if (solved && !solvedOnce.current && !restoring) {
      solvedOnce.current = true;
      setCelebrate(true);
      onSolved?.(slot);
    }
    if (!solved) solvedOnce.current = false;
  }, [solved, restoring, onSolved, slot]);

  /* input --------------------------------------------------------------- */
  const type = useCallback(
    (letter: string) => setState((s) => place(puzzle, slots, s, letter)),
    [puzzle, slots]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;

      const upper = e.key.toUpperCase();
      if (/^[A-Z]$/.test(upper) && upper.length === 1) {
        type(upper);
        e.preventDefault();
        return;
      }
      switch (e.key) {
        case "Backspace":
        case "Delete":
          setState((s) => erase(puzzle, s));
          e.preventDefault();
          break;
        case "ArrowLeft":  setState((s) => step(puzzle, slots, s, 0, -1)); e.preventDefault(); break;
        case "ArrowRight": setState((s) => step(puzzle, slots, s, 0, 1));  e.preventDefault(); break;
        case "ArrowUp":    setState((s) => step(puzzle, slots, s, -1, 0)); e.preventDefault(); break;
        case "ArrowDown":  setState((s) => step(puzzle, slots, s, 1, 0));  e.preventDefault(); break;
        case " ":
          setState((s) => toggleDir(slots, s));
          e.preventDefault();
          break;
        case "Tab": {
          setState((s) => {
            const next = nextWordCell(puzzle, slots, s, e.shiftKey ? -1 : 1);
            return next ? { ...s, cursor: next.cell, dir: next.dir } : s;
          });
          e.preventDefault();
          break;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [puzzle, slots, type]);

  /* derived ------------------------------------------------------------- */
  const run = currentRun(slots, state);
  const inWord = useMemo(() => {
    const s = new Set<string>();
    if (run) for (const { r, c } of run.cells) s.add(`${r},${c}`);
    return s;
  }, [run]);
  const selCode = state.cursor ? codeAt(puzzle, state.cursor.r, state.cursor.c) : null;
  const used = lettersUsed(state);
  const cracked = Object.keys(state.assign).length;

  const onCellClick = (r: number, c: number) => {
    setState((s) =>
      s.cursor && s.cursor.r === r && s.cursor.c === c
        ? toggleDir(slots, s)
        : focusCell(slots, s, r, c)
    );
  };

  const runCheck = () => {
    setState((s) => check(puzzle, s));
    setTimeout(() => setState((s) => ({ ...s, wrong: new Set() })), 1600);
  };

  return (
    <div className="sheet">
      <header>
        <div>
          <h1>Codeword</h1>
          <div className="strapline">Every Letter A–Z Appears At Least Once</div>
        </div>
        <div className="badges">
          <div className="pill-no">{puzzle.title}</div>
          <div className="pill-diff">{puzzle.difficulty}</div>
        </div>
      </header>

      {puzzle.theme && (
        <div className="introrow">
          <div className="theme-tag">
            <span className="label">Theme</span>
            <span className="value">{puzzle.theme}</span>
          </div>
        </div>
      )}

      <details className="disclosure">
        <summary>
          <span className="chev" />
          How to play
        </summary>
        <div className="disclosure-body">
          <p className="intro">
            Each number stands for a different letter, and the same number always means the same
            letter. Crack the code, fill every square, and complete the grid with real words.
            Every letter A–Z appears at least once, and four starter letters are already entered
            to get you going.
          </p>
          <p className="intro">
            Tap a square, then type or tap a letter — it fills every square with that number at
            once. <b>Tap the same square again</b> to switch between across and down; arrow keys
            move, tab jumps to the next word.
          </p>
        </div>
      </details>

      <div className="gridwrap">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${puzzle.size},1fr)` }}>
          {puzzle.grid.map((row, r) =>
            row.map((n, c) => {
              if (!n) return <div key={`${r},${c}`} className="cell block" />;
              const isCursor = !!state.cursor && state.cursor.r === r && state.cursor.c === c;
              const cls = [
                "cell",
                inWord.has(`${r},${c}`) ? "word" : "",
                selCode !== null && n === selCode ? "same" : "",
                isCursor ? "sel" : "",
                state.locked.has(n) ? "given" : "",
                state.wrong.has(n) ? "wrong" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <div key={`${r},${c}`} className={cls} onClick={() => onCellClick(r, c)}>
                  <span className="num">{n}</span>
                  <span className="ltr">{state.assign[n] ?? ""}</span>
                </div>
              );
            })
          )}
          {celebrate && (
            <Celebration theme={puzzle.theme} onDone={() => setCelebrate(false)} />
          )}
        </div>
      </div>

      <div className="status">
        <span>
          Selected number <b>{selCode ?? "—"}</b>
        </span>
        <span>{cracked} / 26 cracked</span>
      </div>

      <div className="pad">
        {ALPHA.map((L) => (
          <button
            key={L}
            className={`key${used.has(L) ? " used" : ""}`}
            onClick={() => type(L)}
          >
            {L}
          </button>
        ))}
        <button className="key wide" onClick={() => setState((s) => erase(puzzle, s))}>
          Erase
        </button>
      </div>

      <div className="tools">
        <button className="tool" onClick={runCheck}>
          Check
        </button>
        <button className="tool" onClick={() => setState((s) => reveal(puzzle, slots, s))}>
          Reveal a letter
        </button>
        <button className="tool" onClick={() => setState(clear(puzzle, slots))}>
          Clear entries
        </button>
        <button className="tool" onClick={() => window.print()}>
          Print
        </button>
      </div>

      <details className="disclosure" open>
        <summary>
          <span className="chev" />
          Code key
          <span className="sum-note">{cracked} / 26</span>
        </summary>
        <div className="disclosure-body">
          {[0, 1].map((half) => (
            <div className="kgrid" key={half} style={half ? { marginTop: 8 } : undefined}>
              {Array.from({ length: 13 }, (_, i) => half * 13 + i + 1).map((code) => (
                <div
                  key={code}
                  className={`kcell${state.locked.has(code) ? " given" : ""}${
                    selCode === code ? " sel" : ""
                  }`}
                  onClick={() => setState((s) => focusCode(puzzle, slots, s, code))}
                >
                  <span className="kn">{code}</span>
                  <div className="kbox">{state.assign[code] ?? ""}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </details>

      <details className="disclosure">
        <summary>
          <span className="chev" />
          Letters used
          <span className="sum-note">{26 - cracked} left</span>
        </summary>
        <div className="disclosure-body">
          <div className="tracker">
            {ALPHA.map((L) => (
              <div key={L} className={`tcell${used.has(L) ? " used" : ""}`}>
                {L}
              </div>
            ))}
          </div>
        </div>
      </details>

      {solved && (
        <div className="win show">
          <span>Solved. The whole alphabet is accounted for.</span>
        </div>
      )}

      <footer>
        <span>Codeword · 13 × 13 · every letter a–z appears</span>
        {/* say where the save actually went, rather than claiming more than happened */}
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
