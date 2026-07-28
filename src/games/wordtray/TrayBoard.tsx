"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Mark from "@/components/Mark";
import {
  cells,
  cellsOf,
  clearPick,
  hint,
  hintTarget,
  hintsLeft,
  initialState,
  isSolved,
  lit,
  pick,
  shuffle,
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
  /** the word that just landed, so its letters can arrive one after another */
  const [landing, setLanding] = useState<string | null>(null);
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

  const order = useMemo(() => trayOrder(puzzle, state.shuffles), [puzzle, state.shuffles]);
  const grid = useMemo(() => cells(puzzle), [puzzle]);
  const filled = useMemo(() => lit(puzzle, state), [puzzle, state]);
  const given = useMemo(() => new Set(state.shown), [state.shown]);
  /** the cell a hint just gave, so it can arrive rather than blink on */
  const [revealed, setRevealed] = useState<string | null>(null);

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
        { words: puzzle.words.length, bonus: state.extras.length, hints: state.shown.length },
        elapsed
      );
    }
    if (!solved) solvedOnce.current = false;
  }, [
    solved,
    restoring,
    onSolved,
    slot,
    puzzle.words.length,
    state.extras.length,
    state.shown.length,
    stopTimer,
    elapsed,
  ]);

  const send = useCallback(() => {
    setState((s) => {
      const { state: next, outcome, word } = submit(puzzle, s);
      if (outcome === "found") setLanding(word);
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

  useEffect(() => {
    if (!landing) return;
    const id = setTimeout(() => setLanding(null), 900);
    return () => clearTimeout(id);
  }, [landing]);

  useEffect(() => {
    if (!revealed) return;
    const id = setTimeout(() => setRevealed(null), 900);
    return () => clearTimeout(id);
  }, [revealed]);

  const target = hintTarget(puzzle, state);
  const askHint = useCallback(() => {
    const k = hintTarget(puzzle, state);
    if (!k) return;
    setRevealed(k);
    setState((s) => hint(puzzle, s));
  }, [puzzle, state]);

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

  /** where each tapped letter sits in the ring, in the order it was tapped */
  const trace = useMemo(() => {
    const n = order.length;
    return state.picked
      .map((i) => order.indexOf(i))
      .filter((seat) => seat >= 0)
      .map((seat): [number, number] => {
        const a = (seat / n) * 2 * Math.PI;
        return [50 + 38 * Math.sin(a), 50 - 38 * Math.cos(a)];
      });
  }, [state.picked, order]);

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
          <p className="intro">
            Stuck? <b>Hint</b> gives away one letter in the grid — three per tray, and no more.
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
          const key = `${x},${y}`;
          const on = filled.has(key);
          // a hinted letter shows, but pale and unfilled — it is help, not a
          // word you found, and the grid should not claim otherwise
          const help = !on && given.has(key);
          // how far along the landing word this cell sits, so the letters
          // arrive left to right rather than all at once
          const place = landing
            ? puzzle.words
                .filter((p) => p.word === landing)
                .map((p) => cellsOf(p).indexOf(key))
                .find((n) => n >= 0)
            : undefined;
          const arriving = place !== undefined || key === revealed;
          return (
            <span
              className={
                "wt-cell" + (on ? " on" : "") + (help ? " given" : "") + (arriving ? " landing" : "")
              }
              key={i}
              style={
                place !== undefined
                  ? ({ "--land-delay": `${place * 55}ms` } as React.CSSProperties)
                  : undefined
              }
            >
              {on || help ? cell.letter : ""}
            </span>
          );
        })}
      </div>

      {/* The tray as a ring, with the word forming in the middle of it.
          A straight row of seven reads as a keyboard; a ring reads as letters
          to play with, and it puts what you are spelling where you are already
          looking. Each seat is rotated into place and the letter inside is
          rotated back upright — the float animation then composes on top rather
          than fighting the placement. */}
      <div className="wt-ring" style={{ "--n": order.length } as React.CSSProperties}>
        {/* The trace, first so it sits under the letters and the word.
            Seat i is at 38% of the ring from the middle, turned i/n of the way
            round from the top — the same numbers the CSS uses, which is why the
            radius there is a percentage and not a pixel count. */}
        {trace.length > 1 && (
          <svg className="wt-trace" viewBox="0 0 100 100" aria-hidden="true">
            <polyline points={trace.map(([x, y]) => `${x},${y}`).join(" ")} />
            {trace.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={1.1} />
            ))}
          </svg>
        )}
        <div className={"wt-say" + (say ? ` ${say.kind}` : "")} role="status">
          {say?.text ?? (word || "")}
        </div>
        {order.map((n, i) => {
          const used = state.picked.includes(n);
          return (
            <span className="wt-seat" key={n} style={{ "--i": i } as React.CSSProperties}>
              <button
                className={"wt-letter" + (used ? " used" : "")}
                onClick={() => setState((s) => pick(s, n))}
                disabled={used || solved}
                aria-label={puzzle.letters[n]}
              >
                {puzzle.letters[n]}
              </button>
            </span>
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
        {/* the same seven letters somewhere else — staring at one arrangement is
            how you stop seeing the word that is in it */}
        <button className="tool" onClick={() => setState(shuffle)} disabled={solved}>
          Shuffle
        </button>
        {/* the count is on the button rather than beside it: three is the whole
            constraint, and it should be readable at the moment you are deciding
            whether to spend one */}
        <button
          className="tool"
          onClick={askHint}
          disabled={!target || solved}
          title="Give away one letter in the grid"
        >
          Hint · {hintsLeft(state)}
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
