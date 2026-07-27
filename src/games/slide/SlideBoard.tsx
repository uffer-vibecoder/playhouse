"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Mark from "@/components/Mark";
import {
  CELLS,
  SIZE,
  hint,
  homeCount,
  initialState,
  isSolvedPuzzle,
  reset,
  slide,
  slideByDirection,
  toSave,
  type Puzzle,
  type Saved,
  type State,
  type Tiles,
} from "./engine";
import { fingerprint, loadProgress, saveProgress, slotKey, type SaveOutcome } from "@/lib/progress";
import Celebration from "@/components/Celebration";

const GAME_ID = "slide";

/** Far past any real game, and it only exists so history cannot grow forever. */
const HISTORY_CAP = 300;

type Session = { state: State; past: Tiles[]; future: Tiles[] };

export default function SlideBoard({
  puzzle,
  index,
  onSolved,
  onNext,
}: {
  puzzle: Puzzle;
  index: number;
  onSolved?: (slot: string) => void;
  onNext?: () => void;
}) {
  /**
   * The board plus its move history.
   *
   * History is deliberately NOT part of the saved state: every entry is a whole
   * board, so persisting it would multiply the save by however many moves have
   * been made, and undo is session state in the same way scratch working is.
   * It starts empty after a reload, which is what a player expects.
   *
   * One `useState` rather than three, so a move can push history and change the
   * board in a single pure update — nesting setters inside another setter's
   * updater double-fires under StrictMode.
   */
  const [session, setSession] = useState<Session>(() => ({
    state: initialState(puzzle, index),
    past: [],
    future: [],
  }));
  const state = session.state;
  const setState = useCallback(
    (next: State | ((s: State) => State)) =>
      setSession((sess) => ({
        state: typeof next === "function" ? (next as (s: State) => State)(sess.state) : next,
        past: [],
        future: [],
      })),
    []
  );
  const [restoredSlot, setRestoredSlot] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [saved, setSaved] = useState<SaveOutcome | null>(null);
  /** The tile a hint is pointing at, and whether the search is still running. */
  const [hinted, setHinted] = useState<number | null>(null);
  const [thinking, setThinking] = useState(false);
  const [noLine, setNoLine] = useState(false);
  const solvedOnce = useRef(false);

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
      setState(initialState(puzzle, index, rec?.entries));
      setCelebrate(false);
      setRestoredSlot(slot);
    });
    return () => {
      alive = false;
    };
  }, [slot, puzzle, index, setState]);

  /* persist */
  const solved = isSolvedPuzzle(state);
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

  /**
   * Make a move and record it.
   *
   * `slide` returns the state unchanged when the move is illegal — a tile out
   * of line with the gap — so reference equality is what decides whether
   * anything happened. Without that check, tapping a tile that cannot move
   * would still push a history entry and make undo do nothing visible.
   */
  const move = useCallback((fn: (s: State) => State) => {
    setSession((sess) => {
      const next = fn(sess.state);
      if (next === sess.state) return sess;
      return {
        state: next,
        past: [...sess.past, sess.state.tiles].slice(-HISTORY_CAP),
        future: [],
      };
    });
  }, []);

  const push = useCallback(
    (i: number) => {
      setHinted(null); // a hint is about one position and stops being true after a move
      setNoLine(false);
      move((s) => slide(s, i));
    },
    [move]
  );

  /**
   * Point at the next move on a shortest solution.
   *
   * The search is handed a frame before it runs. It is usually about 20ms, but
   * a badly tangled board can take a second, and a second of synchronous work
   * with no feedback reads as a hang rather than as thinking.
   *
   * It points; it does not move. Taking the move is still the player's.
   */
  const askHint = useCallback(() => {
    setNoLine(false);
    setThinking(true);
    setTimeout(() => {
      const h = hint(state.tiles);
      setThinking(false);
      if (h.kind === "move") setHinted(state.tiles[h.index]);
      else setNoLine(true);
    }, 30);
  }, [state.tiles]);

  const undo = useCallback(() => {
    setSession((sess) => {
      if (!sess.past.length) return sess;
      return {
        state: { tiles: sess.past[sess.past.length - 1], last: null },
        past: sess.past.slice(0, -1),
        future: [sess.state.tiles, ...sess.future].slice(0, HISTORY_CAP),
      };
    });
  }, []);

  const redo = useCallback(() => {
    setSession((sess) => {
      if (!sess.future.length) return sess;
      const [next, ...rest] = sess.future;
      return {
        state: { tiles: next, last: null },
        past: [...sess.past, sess.state.tiles].slice(-HISTORY_CAP),
        future: rest,
      };
    });
  }, []);

  /* arrow keys move the gap; the usual undo shortcuts work too */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) return;

      // checked before the modifier guard below, since these *are* modifiers
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        if (e.shiftKey) redo();
        else undo();
        e.preventDefault();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const by: Record<string, [number, number]> = {
        ArrowUp: [1, 0],
        ArrowDown: [-1, 0],
        ArrowLeft: [0, 1],
        ArrowRight: [0, -1],
      };
      const d = by[e.key];
      if (!d) return;
      move((s) => slideByDirection(s, d[0], d[1]));
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, undo, redo]);

  const home = homeCount(state);

  /**
   * Tiles are positioned rather than reordered.
   *
   * Each tile keeps the same DOM node for the life of the puzzle — keyed by its
   * number, not its position — and only its offset changes. That is what lets
   * CSS animate the move; re-sorting a grid would make tiles teleport, and a
   * sliding puzzle that does not slide feels broken rather than minimal.
   */
  const step = 100 / SIZE;

  return (
    <div className="sheet">
      <header>
        <div>
          <h1>Sliding Tiles</h1>
          <div className="titlerow">
            <span className="strapline">Fifteen numbers and a gap</span>
            <span className="pill-num">{puzzle.id.replace("SL-", "NO. ")}</span>
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
            Put the numbers back in order, one to fifteen, with the gap at the end. Tap any tile in
            line with the gap and the whole row or column slides across together.
          </p>
          <p className="intro">
            Arrow keys work too — they move the <b>gap</b>, which is the opposite of moving a tile.
            Every board here is solvable; there is no arrangement you can reach that traps you.
          </p>
        </div>
      </details>

      <div className="sl-wrap">
        <div className="sl-board" role="group" aria-label="Sliding tiles">
          {state.tiles.map((tile, i) =>
            tile === 0 ? null : (
              <button
                key={tile}
                className={["sl-tile", tile === i + 1 ? "home" : "", state.last === tile ? "moved" : "", hinted === tile ? "hinted" : ""]
                  .filter(Boolean)
                  .join(" ")}
                style={{
                  left: `${(i % SIZE) * step}%`,
                  top: `${Math.floor(i / SIZE) * step}%`,
                }}
                onClick={() => push(i)}
                aria-label={`${tile}, row ${Math.floor(i / SIZE) + 1}, column ${(i % SIZE) + 1}`}
              >
                {tile}
              </button>
            )
          )}
        </div>
        {celebrate && <Celebration onDone={() => setCelebrate(false)} />}
      </div>

      <div className="status" aria-live="polite">
        {solved
          ? "In order. That's the one."
          : noLine
            ? "This one is tangled past what I can see from here — try Back a few moves."
            : hinted !== null
              ? `Try moving ${hinted}.`
              : `${home} of ${CELLS - 1} in place`}
      </div>

      <div className="tools">
        <button className="tool" onClick={undo} disabled={!session.past.length}>
          Back
        </button>
        <button className="tool" onClick={redo} disabled={!session.future.length}>
          Redo
        </button>
        <button className="tool" onClick={askHint} disabled={thinking || solved}>
          {thinking ? "Thinking…" : "Hint"}
        </button>
        <button className="tool" onClick={() => setState(reset(puzzle, index))}>
          Start over
        </button>
        <button className="tool" onClick={onNext}>
          Next puzzle
        </button>
      </div>

      {solved && (
        <div className="win show">
          <span>All fifteen in order.</span>
        </div>
      )}

      <footer>
        <span>Sliding tiles · fifteen and a gap</span>
        <span title={saved && "error" in saved ? saved.error : undefined}>
          {!saved
            ? "Your board saves automatically"
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
