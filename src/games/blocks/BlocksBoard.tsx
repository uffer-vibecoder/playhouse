"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Mark from "@/components/Mark";
import {
  DIRS,
  initialState,
  isSolved,
  reach,
  slide,
  toSave,
  undo as undoMove,
  type Block,
  type Dir,
  type Puzzle,
  type Saved,
  type State,
} from "./engine";
import { fingerprint, loadProgress, recordResult, saveProgress, slotKey, type SaveOutcome } from "@/lib/progress";
import Celebration from "@/components/Celebration";
import TimerButton from "@/components/TimerButton";
import { useTimer } from "@/lib/use-timer";

const GAME_ID = "blocks";

/** A drag has to travel this far before it counts as one, in px. */
const DRAG_FLOOR = 8;

export default function BlocksBoard({
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
  const [picked, setPicked] = useState<number | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [saved, setSaved] = useState<SaveOutcome | null>(null);
  const solvedOnce = useRef(false);
  const boardRef = useRef<HTMLDivElement>(null);

  const slot = useMemo(
    () =>
      slotKey(
        GAME_ID,
        puzzle.id,
        fingerprint(
          puzzle.blocks.map((b) => [b.x, b.y, b.w, b.h]),
          `${puzzle.gate.edge}${puzzle.gate.at}${puzzle.gate.len}`
        )
      ),
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
      setState(initialState(puzzle, rec?.entries));
      setPicked(null);
      setCelebrate(false);
      setRestoredSlot(slot);
    });
    return () => {
      alive = false;
    };
  }, [slot, puzzle]);

  /* persist */
  const solved = isSolved(state);
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
      /* the record's copy: facts about the attempt, never the answer. Par
         travels with it so a result reads on its own terms later. */
      void recordResult(slot, GAME_ID, { moves: state.moves, par: puzzle.par }, elapsed);
    }
    if (!solved) solvedOnce.current = false;
  }, [solved, restoring, onSolved, slot, state.moves, puzzle.par, stopTimer, elapsed]);

  const go = useCallback(
    (id: number, dir: Dir, distance?: number) => {
      setState((s) => slide(puzzle, s, id, dir, distance));
    },
    [puzzle]
  );

  /* keyboard: pick a block, then push it */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (picked === null || e.metaKey || e.ctrlKey || e.altKey) return;
      const dir: Dir | null =
        e.key === "ArrowUp" ? "up"
        : e.key === "ArrowDown" ? "down"
        : e.key === "ArrowLeft" ? "left"
        : e.key === "ArrowRight" ? "right"
        : null;
      if (!dir) return;
      e.preventDefault();
      go(picked, dir);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picked, go]);

  /**
   * Drag a block.
   *
   * The distance travelled decides how far it goes, so a short nudge moves one
   * cell and a long pull sends it as far as it will run — the same gesture at
   * two lengths, which is what a sliding block ought to feel like. The dominant
   * axis wins outright rather than blending, because a block that answered a
   * diagonal drag with a compromise would feel like it had a mind of its own.
   */
  const onPointerDown = (e: React.PointerEvent, id: number) => {
    setPicked(id);
    const board = boardRef.current;
    if (!board) return;
    const cell = board.clientWidth / puzzle.w;
    const startX = e.clientX;
    const startY = e.clientY;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    const finish = (ev: PointerEvent) => {
      window.removeEventListener("pointerup", finish);
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (Math.abs(dx) < DRAG_FLOOR && Math.abs(dy) < DRAG_FLOOR) return; // a tap, not a drag
      const horizontal = Math.abs(dx) > Math.abs(dy);
      const dir: Dir = horizontal ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
      const cells = Math.max(1, Math.round(Math.abs(horizontal ? dx : dy) / cell));
      go(id, dir, cells);
    };
    window.addEventListener("pointerup", finish);
  };

  const inTheWay = state.blocks.filter((b) => !b.hero).length;
  const step = (n: number, of: number) => `${(n / of) * 100}%`;

  /** Where a block can go from here, so the arrows only offer real moves. */
  const openDirs = (b: Block) =>
    DIRS.filter((d) => reach(puzzle, state.blocks, b.id, d).max > 0);

  return (
    <div className="sheet">
      <header>
        <div>
          <h1>Colour Blocks</h1>
          <div className="titlerow">
            <span className="strapline">One block is trying to get out</span>
            <span className="pill-num">{puzzle.id.replace("CB-", "NO. ")}</span>
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
            One block is trying to get out — the marked one. Everything else is in the way and
            stays on the board. Drag a block to slide it: a nudge moves it one square, a longer
            pull sends it as far as it will go. Or tap it and use the arrow keys.
          </p>
          <p className="intro">
            The way out only takes the marked block, and only if the whole of it fits through.
            Get it out to finish; get it out in <b>{puzzle.par}</b> moves and you have found the
            shortest way.
          </p>
        </div>
      </details>

      <div className="cb-wrap">
        <div
          className="cb-board"
          ref={boardRef}
          style={{ aspectRatio: `${puzzle.w} / ${puzzle.h}` }}
          role="group"
          aria-label={`${puzzle.w} by ${puzzle.h} board`}
        >
          {/* the ruled cells, so a block's travel is readable */}
          <div
            className="cb-cells"
            aria-hidden="true"
            style={{
              gridTemplateColumns: `repeat(${puzzle.w}, 1fr)`,
              gridTemplateRows: `repeat(${puzzle.h}, 1fr)`,
            }}
          >
            {Array.from({ length: puzzle.w * puzzle.h }, (_, i) => (
              <span className="cb-cell" key={i} />
            ))}
          </div>

          {(() => {
            const g = puzzle.gate;
            const across = g.edge === "top" || g.edge === "bottom";
            const along = across ? puzzle.w : puzzle.h;
            return (
              <span
                className={`cb-gate cb-${g.edge}`}
                style={
                  across
                    ? { left: step(g.at, along), width: step(g.len, along) }
                    : { top: step(g.at, along), height: step(g.len, along) }
                }
                aria-label={`the way out, ${g.len} wide, on the ${g.edge}`}
              >
                {/* an arrow pointing out, so the exit is not told apart by
                    colour alone — it says which way, too */}
                <span className="cb-out" aria-hidden="true">
                  {g.edge === "top" ? "↑" : g.edge === "bottom" ? "↓" : g.edge === "left" ? "←" : "→"}
                </span>
              </span>
            );
          })()}

          {state.blocks.map((b) => (
            <button
              key={b.id}
              className={`cb-block${b.hero ? " hero" : ""}${picked === b.id ? " on" : ""}`}
              style={{
                left: step(b.x, puzzle.w),
                top: step(b.y, puzzle.h),
                width: step(b.w, puzzle.w),
                height: step(b.h, puzzle.h),
              }}
              onPointerDown={(e) => onPointerDown(e, b.id)}
              onClick={() => setPicked(b.id)}
              aria-label={`${b.hero ? "the block trying to get out" : "a block in the way"}, ${
                b.w
              } by ${b.h}, at column ${b.x + 1} row ${b.y + 1}`}
              aria-pressed={picked === b.id}
            >
              {/* the mark, so the one that matters is not told apart by colour
                  alone — it reads in greyscale, which is the test */}
              {b.hero && <span className="cb-mark" aria-hidden="true">◆</span>}
            </button>
          ))}
        </div>

        {/* A picked block offers its legal moves as buttons. The drag is the
            nice way to play; this is the one that works with a keyboard, a
            screen reader, or a trackpad someone does not want to fight. */}
        {picked !== null && state.blocks.some((b) => b.id === picked) && (
          <div className="cb-nudge">
            <span className="cb-nudgelabel">Push it</span>
            {openDirs(state.blocks.find((b) => b.id === picked)!).map((d) => (
              <button key={d} className="tool" onClick={() => go(picked, d)}>
                {d}
              </button>
            ))}
          </div>
        )}

        {celebrate && <Celebration onDone={() => setCelebrate(false)} />}
      </div>

      <div className="status">
        <span>
          {solved ? "out" : `${inTheWay} in the way`}
        </span>
        <span>
          {state.moves} move{state.moves === 1 ? "" : "s"} · par {puzzle.par}
        </span>
      </div>

      {solved && (
        <div className="win">
          {state.moves <= puzzle.par
            ? `Out in ${state.moves} — that is the shortest way there is.`
            : `Out in ${state.moves}. The shortest way is ${puzzle.par}.`}
        </div>
      )}

      <div className="tools">
        <TimerButton timer={timer} solved={solved} />
        <button
          className="tool"
          onClick={() => setState(undoMove)}
          disabled={!state.past.length}
        >
          Back
        </button>
        <button className="tool" onClick={() => setState(initialState(puzzle))}>
          Start over
        </button>
        <button className="tool" onClick={onNext}>
          Next puzzle
        </button>
      </div>

      <footer>
        <span>Colour Blocks · every board has a way out</span>
        <span>{saved?.where === "cloud" ? "Saved to your account" : "Saved on this device"}</span>
      </footer>
    </div>
  );
}
