"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Mark from "@/components/Mark";
import {
  SHAPES,
  SIZE,
  at,
  fits,
  footprint,
  initialState,
  isOver,
  place,
  toSave,
  wouldClear,
  type Saved,
  type State,
} from "./engine";
import { fingerprint, loadProgress, recordResult, saveProgress, slotKey, type SaveOutcome } from "@/lib/progress";
import Celebration from "@/components/Celebration";

const GAME_ID = "blockout";

export default function BlockBoard({ seed, run, onNewRun }: { seed: number; run: number; onNewRun: () => void }) {
  const [state, setState] = useState<State>(() => initialState(seed));
  const [restoredSlot, setRestoredSlot] = useState<string | null>(null);
  /** which tray piece is picked up, and where it is hovering */
  const [holding, setHolding] = useState<number | null>(null);
  const [over, setOver] = useState<{ x: number; y: number } | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [saved, setSaved] = useState<SaveOutcome | null>(null);
  const endedOnce = useRef(false);

  const slot = useMemo(
    () => slotKey(GAME_ID, `run-${run}`, fingerprint([[seed]], String(seed))),
    [seed, run]
  );
  const restoring = restoredSlot !== slot;

  useEffect(() => {
    let alive = true;
    endedOnce.current = false;
    loadProgress<Saved>(slot).then((rec) => {
      if (!alive) return;
      setState(initialState(seed, rec?.entries));
      setHolding(null);
      setOver(null);
      setCelebrate(false);
      setRestoredSlot(slot);
    });
    return () => { alive = false; };
  }, [slot, seed]);

  const done = isOver(state);
  useEffect(() => {
    if (restoring) return;
    const id = setTimeout(() => {
      // `solved` is false even at the end: a run that stopped is not a puzzle
      // that was finished, and the picker's tick would be a lie
      void saveProgress<Saved>(slot, GAME_ID, toSave(state), false).then(setSaved);
    }, 400);
    return () => clearTimeout(id);
  }, [state, slot, restoring]);

  useEffect(() => {
    if (done && !endedOnce.current && !restoring) {
      endedOnce.current = true;
      // queued rather than set in the effect body: React objects to a
      // synchronous setState here, and a run ending is not so urgent that it
      // needs to beat the next paint
      queueMicrotask(() => { if (state.score > 0) setCelebrate(true); });
      /* the run's score and length — never the board, which is not a secret but
         is also not a fact about how it went */
      void recordResult(slot, GAME_ID, { score: state.score, placed: state.placed, run }, null);
    }
    if (!done) endedOnce.current = false;
  }, [done, restoring, slot, state.score, state.placed, run]);

  const shapeOf = useCallback(
    (i: number) => SHAPES[state.tray[i].shapeIndex].shape,
    [state.tray]
  );

  /** Where the held piece would land if dropped on this square. */
  const preview = useMemo(() => {
    if (holding === null || !over) return { cells: [] as number[], clears: [] as number[], ok: false };
    const shape = shapeOf(holding);
    const ok = fits(state.grid, shape, over.x, over.y);
    return {
      cells: footprint(shape, over.x, over.y),
      clears: ok ? wouldClear(state.grid, shape, over.x, over.y) : [],
      ok,
    };
  }, [holding, over, state.grid, shapeOf]);

  const drop = useCallback(
    (x: number, y: number) => {
      if (holding === null) return;
      setState((s) => {
        const next = place(s, holding, x, y);
        if (next !== s) setHolding(null);
        return next;
      });
      setOver(null);
    },
    [holding]
  );

  /**
   * Drag a piece onto the board.
   *
   * The hover preview was mouse-only to begin with, which meant a phone placed
   * pieces blind — `pointerenter` does not fire for a finger, and this is a
   * game where a misplacement cannot be taken back. Dragging gives the same
   * ghost to both: the square under the pointer is read from the document on
   * every move, so a finger and a cursor take exactly one code path.
   *
   * Tap-then-tap still works, and is the path a keyboard takes.
   */
  const gridRef = useRef<HTMLDivElement>(null);

  const squareUnder = (clientX: number, clientY: number) => {
    const grid = gridRef.current;
    if (!grid) return null;
    const box = grid.getBoundingClientRect();
    // the cells are square and evenly gapped, so the arithmetic is enough and
    // avoids elementFromPoint, which finds the ghost overlay rather than a cell
    const pad = 5;
    const inner = box.width - pad * 2;
    const step = inner / SIZE;
    const x = Math.floor((clientX - box.left - pad) / step);
    const y = Math.floor((clientY - box.top - pad) / step);
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return null;
    return { x, y };
  };

  const startDrag = (e: React.PointerEvent, i: number) => {
    if (state.tray[i].used || done) return;
    setHolding(i);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    const move = (ev: PointerEvent) => {
      const sq = squareUnder(ev.clientX, ev.clientY);
      setOver(sq);
    };
    const finish = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      const sq = squareUnder(ev.clientX, ev.clientY);
      // a tap that never left the tray keeps the piece held, so tap-then-tap
      // still works; a drag onto the board places it
      //
      // Placed with the index this drag started from rather than through
      // `drop`: that reads `holding`, which was still null in the closure this
      // handler was created in, so the drop silently did nothing.
      if (!sq) return;
      setState((s) => place(s, i, sq.x, sq.y));
      setHolding(null);
      setOver(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
  };

  const clearing = new Set(state.lastCleared);

  return (
    <div className="sheet">
      <header>
        <div>
          <h1>Block Out!</h1>
          <div className="titlerow">
            <span className="strapline">Fill a row or a column and it goes</span>
            <span className="pill-num">RUN {run}</span>
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
            Tap a piece, then tap the board to place it. Fill a whole row or column and it
            clears. Pieces never rotate, and a fresh three only arrives once all three have
            gone — so the question is never just &ldquo;where does this fit&rdquo; but
            &ldquo;where do all three fit&rdquo;.
          </p>
          <p className="intro">
            It ends when none of the three will go anywhere. There is no undo and nothing to
            finish: the score is the whole point. Clearing two lines at once is worth more than
            clearing one twice, and clearing on consecutive turns is worth more again.
          </p>
        </div>
      </details>

      <div className="bo-score">
        <span className="bo-points">{state.score}</span>
        <span className="bo-label">points</span>
        {state.streak > 1 && <span className="bo-streak">{state.streak} in a row</span>}
      </div>

      <div className="bo-grid" ref={gridRef} role="grid" aria-label="Eight by eight board">
        {Array.from({ length: SIZE }, (_, y) =>
          Array.from({ length: SIZE }, (_, x) => {
            const i = at(x, y);
            const filled = state.grid[i];
            const ghost = preview.cells.includes(i);
            const willClear = preview.clears.includes(i);
            return (
              <button
                key={i}
                className={[
                  "bo-cell",
                  filled ? `hue-${filled}` : "",
                  ghost ? (preview.ok ? " ghost" : " nogo") : "",
                  willClear ? " willclear" : "",
                  clearing.has(i) ? " justwent" : "",
                ].join(" ")}
                onPointerEnter={() => holding !== null && setOver({ x, y })}
                onFocus={() => holding !== null && setOver({ x, y })}
                onClick={() => {
                  setOver({ x, y });
                  drop(x, y);
                }}
                aria-label={`Column ${x + 1}, row ${y + 1}${filled ? ", filled" : ""}`}
              />
            );
          })
        )}
      </div>

      {/* The tray. A used piece leaves its gap rather than the others sliding
          along — the three are a hand to plan around, and a shifting row makes
          that harder to read at a glance. */}
      <div className="bo-tray">
        {state.tray.map((p, i) => {
          const shape = SHAPES[p.shapeIndex].shape;
          return (
            <button
              key={i}
              className={`bo-piece${p.used ? " used" : ""}${holding === i ? " on" : ""}`}
              disabled={p.used || done}
              onPointerDown={(e) => startDrag(e, i)}
              onClick={() => setHolding((h) => (h === i ? null : i))}
              aria-label={`${shape.name}, ${shape.cells.length} squares`}
              aria-pressed={holding === i}
            >
              <span
                className="bo-shape"
                style={{
                  gridTemplateColumns: `repeat(${shape.w}, 1fr)`,
                  gridTemplateRows: `repeat(${shape.h}, 1fr)`,
                }}
              >
                {Array.from({ length: shape.w * shape.h }, (_, n) => {
                  const cx = n % shape.w;
                  const cy = Math.floor(n / shape.w);
                  const on = shape.cells.some(([dx, dy]) => dx === cx && dy === cy);
                  return <span className={on ? `bo-bit hue-${(p.shapeIndex % 4) + 1}` : "bo-bit off"} key={n} />;
                })}
              </span>
            </button>
          );
        })}
      </div>

      {celebrate && <Celebration onDone={() => setCelebrate(false)} />}

      <div className="status">
        <span>{state.placed} pieces down</span>
        <span>{holding === null ? "tap a piece, then the board" : "tap where it goes"}</span>
      </div>

      {done && (
        <div className="win">
          Nothing else fits. {state.score} points from {state.placed} pieces.
        </div>
      )}

      <div className="tools">
        <button className="tool" onClick={onNewRun}>
          {done ? "New run" : "Start over"}
        </button>
      </div>

      <footer>
        <span>Block Out! · the pieces come from run {run}&rsquo;s seed</span>
        <span>{saved?.where === "cloud" ? "Saved to your account" : "Saved on this device"}</span>
      </footer>
    </div>
  );
}
