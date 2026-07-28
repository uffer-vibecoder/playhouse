"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Mark from "@/components/Mark";
import {
  SIZE,
  colOf,
  conflicts,
  erase,
  hint,
  hintsLeft,
  initialState,
  isGiven,
  isSolved,
  note,
  nextStep,
  notesIn,
  progress,
  rowOf,
  toSave,
  toggle,
  type Puzzle,
  type Saved,
  type State,
} from "./engine";
import { loadProgress, recordResult, saveProgress, type SaveOutcome } from "@/lib/progress";
import { jigsawSlot } from "@/lib/slots";
import Celebration from "@/components/Celebration";
import TimerButton from "@/components/TimerButton";
import { useTimer } from "@/lib/use-timer";

const GAME_ID = "jigsaw";
const CELLS = SIZE * SIZE;
const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const TIER_NOTE: Record<string, string> = {
  easy: "Plenty on the page already. One number left in a cell, every time.",
  gentle: "Every step is a cell with one number left in it.",
  steady: "Some steps need the shape rather than the cell.",
  tricky: "Mostly the shape. Bring the pencil.",
};

export default function JigsawBoard({
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
  const [at, setAt] = useState<number | null>(null);
  const [pencil, setPencil] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  /** what the last hint said, so the board can answer rather than just act */
  const [said, setSaid] = useState<string | null>(null);
  const [saved, setSaved] = useState<SaveOutcome | null>(null);
  const solvedOnce = useRef(false);

  const slot = useMemo(
    () => jigsawSlot(puzzle),
    [puzzle]
  );
  const timer = useTimer(slot);
  const { stop: stopTimer, ms: elapsed } = timer;
  const restoring = restoredSlot !== slot;

  useEffect(() => {
    let alive = true;
    solvedOnce.current = false;
    loadProgress<Saved>(slot).then((rec) => {
      if (!alive) return;
      setState(initialState(puzzle, rec?.entries));
      setAt(null);
      setCelebrate(false);
      setRestoredSlot(slot);
    });
    return () => { alive = false; };
  }, [slot, puzzle]);

  const solved = isSolved(puzzle, state);

  useEffect(() => {
    if (restoring) return;
    const id = setTimeout(() => {
      void saveProgress<Saved>(slot, GAME_ID, toSave(puzzle, state), solved).then(setSaved);
    }, 400);
    return () => clearTimeout(id);
  }, [state, slot, puzzle, solved, restoring]);

  useEffect(() => {
    if (solved && !solvedOnce.current && !restoring) {
      solvedOnce.current = true;
      stopTimer();
      setCelebrate(true);
      setAt(null);
      onSolved?.(slot);
      /* how it went, never the answer — a result must be safe to show someone
         who has not played this board */
      void recordResult(slot, GAME_ID, { clues: puzzle.clues, tier: puzzle.tier }, elapsed);
    }
    if (!solved) solvedOnce.current = false;
  }, [solved, restoring, onSolved, slot, puzzle.clues, puzzle.tier, state.shown.length, stopTimer, elapsed]);

  const bad = useMemo(() => conflicts(puzzle, state), [puzzle, state]);
  const { done, total } = progress(puzzle, state);

  /**
   * Which sides of a cell get the heavy rule: every edge where the shape ends.
   * Derived from the regions rather than stored, so there is nothing to keep in
   * step with them.
   */
  const edges = useMemo(
    () =>
      Array.from({ length: CELLS }, (_, c) => {
        const y = rowOf(c), x = colOf(c), g = puzzle.regions[c];
        return {
          top: y === 0 || puzzle.regions[c - SIZE] !== g,
          bottom: y === SIZE - 1 || puzzle.regions[c + SIZE] !== g,
          left: x === 0 || puzzle.regions[c - 1] !== g,
          right: x === SIZE - 1 || puzzle.regions[c + 1] !== g,
        };
      }),
    [puzzle.regions]
  );

  const put = useCallback(
    (v: number) => {
      if (at === null || solved) return;
      setState((s) => (pencil ? note(puzzle, s, at, v) : toggle(puzzle, s, at, v)));
    },
    [at, pencil, puzzle, solved]
  );

  const step = nextStep(puzzle, state);
  const askHint = useCallback(() => {
    const now = nextStep(puzzle, state);
    if (now.kind === "mistake") {
      // which square is wrong is not given away — knowing that something is
      // wrong is a hint, knowing exactly what is the answer
      setSaid(
        now.count === 1
          ? "Something already written is wrong."
          : `${now.count} of the numbers already written are wrong.`
      );
      return;
    }
    if (now.kind !== "cell") return;
    setAt(now.cell);
    setSaid(
      now.by === "naked"
        ? "That square had one number left in it."
        : "That number had one place left to go in its row, column or shape."
    );
    setState((s) => hint(puzzle, s));
  }, [puzzle, state]);

  useEffect(() => {
    if (!said) return;
    const id = setTimeout(() => setSaid(null), 4000);
    return () => clearTimeout(id);
  }, [said]);

  const rubOut = useCallback(() => {
    if (at === null || solved) return;
    setState((s) => erase(puzzle, s, at));
  }, [at, puzzle, solved]);

  /* the physical keyboard, for anyone who would rather type than tap */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) return;

      if (/^[1-9]$/.test(e.key)) put(Number(e.key));
      else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") rubOut();
      // a note is the shifted version of writing it, which is how a pencil
      // works on paper — the same nine keys, held differently
      else if (e.key === " ") setPencil((p) => !p);
      else if (e.key.startsWith("Arrow")) {
        const dx = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
        const dy = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
        setAt((c) => {
          if (c === null) return 0;
          const x = Math.min(SIZE - 1, Math.max(0, colOf(c) + dx));
          const y = Math.min(SIZE - 1, Math.max(0, rowOf(c) + dy));
          return y * SIZE + x;
        });
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [put, rubOut]);

  /** how many of a number are already placed, so the pad can retire it */
  const placed = useMemo(() => {
    const n = new Array(10).fill(0);
    for (const v of state.entries) if (v) n[v]++;
    return n;
  }, [state.entries]);

  const here = at === null ? 0 : state.entries[at];

  return (
    <div className="sheet">
      <header>
        <div>
          <h1>Jigsaw Sudoku</h1>
          <div className="titlerow">
            <span className="strapline">Nine shapes, not nine boxes</span>
            <span className="pill-num">{puzzle.id.replace("JS-", "NO. ")}</span>
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
            One to nine in every row, every column, and every one of the nine <b>shapes</b> —
            which are the heavy outlines, not squares. That is the only change from sudoku, and
            it is the whole game: a shape can reach across three rows, so the row you are
            looking at is rarely the one that gives the answer away.
          </p>
          <p className="intro">
            Tap a square, then a number. Tapping the same number again rubs it out. Switch to
            the <b>pencil</b> to jot what might go somewhere; a pencilled square holds as many
            as you like, and writing a real number clears them.
          </p>
          <p className="intro">
            Stuck? <b>Hint</b> fills in the next square that can actually be worked out, and says
            why — three per board. If something already written is wrong it will tell you that
            instead, without saying which.
          </p>
          <p className="intro">
            Clashes are marked but never blocked — putting a number in to see what it breaks is
            how these get solved. Every board here can be reasoned to the end with no guessing,
            and that is checked before it ships.
          </p>
        </div>
      </details>

      <div className="js-meta">
        <span className={"js-tier " + puzzle.tier}>{puzzle.tier}</span>
        <span className="js-tiernote">{TIER_NOTE[puzzle.tier]}</span>
      </div>

      <div className="js-grid" role="grid" aria-label="Jigsaw sudoku board">
        {Array.from({ length: CELLS }, (_, c) => {
          const v = state.entries[c];
          const given = isGiven(puzzle, c);
          const fromHint = state.shown.includes(c);
          const e = edges[c];
          const notes = v ? [] : notesIn(state, c);
          const sameRow = at !== null && rowOf(at) === rowOf(c);
          const sameCol = at !== null && colOf(at) === colOf(c);
          const sameShape = at !== null && puzzle.regions[at] === puzzle.regions[c];
          const cls = [
            "js-cell",
            e.top ? "et" : "",
            e.right ? "er" : "",
            e.bottom ? "eb" : "",
            e.left ? "el" : "",
            given ? "given" : "",
            fromHint ? "hinted" : "",
            bad.has(c) ? "clash" : "",
            at === c ? "at" : "",
            at !== null && at !== c && (sameRow || sameCol || sameShape) ? "seen" : "",
            // every other cell holding the number you are looking at
            here && v === here && at !== c ? "echo" : "",
          ].filter(Boolean).join(" ");
          return (
            <button
              key={c}
              className={cls}
              onClick={() => setAt(c)}
              aria-label={`row ${rowOf(c) + 1} column ${colOf(c) + 1}${v ? `, ${v}` : ", empty"}`}
              disabled={solved}
            >
              {v ? (
                <span className="js-num">{v}</span>
              ) : notes.length ? (
                <span className="js-notes" aria-label={`pencilled ${notes.join(" ")}`}>
                  {DIGITS.map((d) => (
                    <span key={d} className={notes.includes(d) ? "on" : ""}>
                      {notes.includes(d) ? d : ""}
                    </span>
                  ))}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="js-pad noprint">
        {DIGITS.map((d) => (
          <button
            key={d}
            className={"js-key" + (placed[d] === SIZE ? " spent" : "")}
            onClick={() => put(d)}
            disabled={at === null || solved}
            aria-label={pencil ? `pencil ${d}` : `write ${d}`}
          >
            {d}
          </button>
        ))}
      </div>

      <div className="js-tools noprint">
        <button
          className="tool"
          aria-pressed={pencil}
          onClick={() => setPencil((p) => !p)}
          title="Jot what might go in a square"
        >
          {pencil ? "Pencil" : "Pen"}
        </button>
        <button className="tool" onClick={rubOut} disabled={at === null || solved}>
          Rub out
        </button>
        {/* the count is on the button: three is the whole constraint, and it
            should be readable at the moment you are deciding to spend one */}
        <button
          className="tool"
          onClick={askHint}
          disabled={solved || step.kind === "none"}
          title="Fill in the next square that can be worked out"
        >
          Hint · {hintsLeft(state)}
        </button>
      </div>

      {said && (
        <div className="js-said" role="status">
          {said}
        </div>
      )}

      {celebrate && <Celebration onDone={() => setCelebrate(false)} />}

      <div className="status">
        <span>
          {done} of {total} filled in
        </span>
        <span>{bad.size ? `${bad.size} clashing` : pencil ? "pencil" : "tap a square"}</span>
      </div>

      {solved && <div className="win show">Finished — every row, every column, every shape.</div>}

      <div className="tools">
        <TimerButton timer={timer} solved={solved} />
        <button className="tool" onClick={() => setState(initialState(puzzle))}>
          Start over
        </button>
        <button className="tool" onClick={onNext}>
          Next board
        </button>
      </div>

      <footer>
        <span>Jigsaw Sudoku · the shapes are the difference</span>
        <span>{saved?.where === "cloud" ? "Saved to your account" : "Saved on this device"}</span>
      </footer>
    </div>
  );
}
