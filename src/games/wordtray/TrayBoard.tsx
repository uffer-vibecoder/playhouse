"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Mark from "@/components/Mark";
import {
  cells,
  cellsOf,
  clearPick,
  initialState,
  isSolved,
  pick,
  spelling,
  submit,
  toSave,
  trayOrder,
  unpick,
  type Outcome,
  type Puzzle,
  type Saved,
  type State,
} from "./engine";
import { fingerprint, loadProgress, recordResult, saveProgress, slotKey, type SaveOutcome } from "@/lib/progress";
import Celebration from "@/components/Celebration";
import TimerButton from "@/components/TimerButton";
import { useTimer } from "@/lib/use-timer";

const GAME_ID = "wordtray";

export default function TrayBoard({
  puzzle,
  onSolved,
  onNext,
}: {
  puzzle: Puzzle;
  onSolved?: (slot: string) => void;
  onNext?: () => void;
}) {
  const [state, setState] = useState<State>(() => initialState(puzzle));
  const [restoredSlot, setRestoredSlot] = useState<string | null>(null);
  const [say, setSay] = useState<{ text: string; kind: Outcome } | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [saved, setSaved] = useState<SaveOutcome | null>(null);
  const solvedOnce = useRef(false);

  const slot = useMemo(
    () => slotKey(GAME_ID, puzzle.id, fingerprint([[puzzle.w, puzzle.h]], puzzle.letters)),
    [puzzle]
  );
  const timer = useTimer(slot);
  const { stop: stopTimer, ms: elapsed } = timer;
  const restoring = restoredSlot !== slot;

  const order = useMemo(() => trayOrder(puzzle), [puzzle]);
  const grid = useMemo(() => cells(puzzle), [puzzle]);
  const filled = useMemo(() => {
    const on = new Set<string>();
    for (const p of puzzle.words) if (state.found.includes(p.word)) for (const k of cellsOf(p)) on.add(k);
    return on;
  }, [puzzle, state.found]);

  useEffect(() => {
    let alive = true;
    solvedOnce.current = false;
    loadProgress<Saved>(slot).then((rec) => {
      if (!alive) return;
      setState(initialState(puzzle, rec?.entries));
      setSay(null);
      setCelebrate(false);
      setRestoredSlot(slot);
    });
    return () => { alive = false; };
  }, [slot, puzzle]);

  const solved = isSolved(puzzle, state);
  useEffect(() => {
    if (restoring) return;
    const id = setTimeout(() => {
      void saveProgress<Saved>(slot, GAME_ID, toSave(state), solved).then(setSaved);
    }, 400);
    return () => clearTimeout(id);
  }, [state, slot, solved, restoring]);

  useEffect(() => {
    if (solved && !solvedOnce.current && !restoring) {
      solvedOnce.current = true;
      stopTimer();
      setCelebrate(true);
      onSolved?.(slot);
      /* how it went, never the words — a result must be safe to show someone
         who has not played this tray */
      void recordResult(
        slot,
        GAME_ID,
        { words: puzzle.words.length, bonus: state.extras.length },
        elapsed
      );
    }
    if (!solved) solvedOnce.current = false;
  }, [solved, restoring, onSolved, slot, puzzle.words.length, state.extras.length, stopTimer, elapsed]);

  const send = useCallback(() => {
    setState((s) => {
      const { state: next, outcome, word } = submit(puzzle, s);
      setSay(
        outcome === "found" ? { text: word, kind: outcome }
        : outcome === "bonus" ? { text: `${word} — a bonus`, kind: outcome }
        : outcome === "again" ? { text: `${word} already`, kind: outcome }
        : word.length ? { text: `${word}?`, kind: "no" }
        : null
      );
      return next;
    });
  }, [puzzle]);

  useEffect(() => {
    if (!say) return;
    const id = setTimeout(() => setSay(null), 1600);
    return () => clearTimeout(id);
  }, [say]);

  /* the physical keyboard, for anyone who would rather type than tap */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
      if (e.key === "Enter") send();
      else if (e.key === "Backspace") setState(unpick);
      else if (e.key === "Escape") setState(clearPick);
      else if (/^[a-zA-Z]$/.test(e.key)) {
        const want = e.key.toUpperCase();
        setState((s) => {
          const i = order.find((n) => puzzle.letters[n] === want && !s.picked.includes(n));
          return i === undefined ? s : pick(s, i);
        });
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [order, puzzle.letters, send]);

  const word = spelling(puzzle, state);

  return (
    <div className="sheet">
      <header>
        <div>
          <h1>Word Tray</h1>
          <div className="titlerow">
            <span className="strapline">Seven letters, and what they spell</span>
            <span className="pill-num">{puzzle.id.replace("WT-", "NO. ")}</span>
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
            Every word in the grid is made from the seven letters below. Tap them to spell
            something and press <b>Enter</b>, or just type. Fill the grid to finish.
          </p>
          <p className="intro">
            A real word the tray makes but the grid does not hold is a <b>bonus</b> — it is
            kept and counted, never marked wrong. There are no clues because the letters are
            the clue.
          </p>
        </div>
      </details>

      <div
        className="wt-grid"
        style={{
          gridTemplateColumns: `repeat(${puzzle.w}, 1fr)`,
          // capped from the column count rather than left to fill the sheet:
          // nine `1fr` columns across a wide sheet gave hundred-pixel squares
          maxWidth: `min(100%, ${puzzle.w * 46}px)`,
        }}
        role="group"
        aria-label={`${puzzle.words.length} words to find`}
      >
        {Array.from({ length: puzzle.w * puzzle.h }, (_, i) => {
          const x = i % puzzle.w;
          const y = Math.floor(i / puzzle.w);
          const cell = grid.find((c) => c.x === x && c.y === y);
          if (!cell) return <span className="wt-void" key={i} aria-hidden="true" />;
          const on = filled.has(`${x},${y}`);
          return (
            <span className={"wt-cell" + (on ? " on" : "")} key={i}>
              {on ? cell.letter : ""}
            </span>
          );
        })}
      </div>

      <div className={"wt-say" + (say ? ` ${say.kind}` : "")} role="status">
        {say?.text ?? (word || " ")}
      </div>

      <div className="wt-tray">
        {order.map((n) => {
          const used = state.picked.includes(n);
          return (
            <button
              key={n}
              className={"wt-letter" + (used ? " used" : "")}
              onClick={() => setState((s) => pick(s, n))}
              disabled={used || solved}
              aria-label={puzzle.letters[n]}
            >
              {puzzle.letters[n]}
            </button>
          );
        })}
      </div>

      <div className="wt-actions">
        <button className="tool" onClick={() => setState(unpick)} disabled={!state.picked.length}>
          Back
        </button>
        <button className="tool" onClick={send} disabled={state.picked.length < 3}>
          Enter
        </button>
        <button className="tool" onClick={() => setState(clearPick)} disabled={!state.picked.length}>
          Clear
        </button>
      </div>

      {state.extras.length > 0 && (
        <div className="wt-bonus">
          <span className="wt-bonushead">Bonus words · {state.extras.length}</span>
          <span className="wt-bonuslist">{state.extras.join(" · ")}</span>
        </div>
      )}

      {celebrate && <Celebration onDone={() => setCelebrate(false)} />}

      <div className="status">
        <span>
          {state.found.length} of {puzzle.words.length} in the grid
        </span>
        <span>{state.extras.length ? `${state.extras.length} bonus` : "type or tap"}</span>
      </div>

      {solved && (
        <div className="win">
          Every word found{state.extras.length ? `, and ${state.extras.length} the grid did not want` : ""}.
        </div>
      )}

      <div className="tools">
        <TimerButton timer={timer} solved={solved} />
        <button className="tool" onClick={() => setState(initialState(puzzle))}>
          Start over
        </button>
        <button className="tool" onClick={onNext}>
          Next tray
        </button>
      </div>

      <footer>
        <span>Word Tray · the letters are the clue</span>
        <span>{saved?.where === "cloud" ? "Saved to your account" : "Saved on this device"}</span>
      </footer>
    </div>
  );
}
