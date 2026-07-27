"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CELLS,
  SIZE,
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
} from "./engine";
import { fingerprint, loadProgress, saveProgress, slotKey, type SaveOutcome } from "@/lib/progress";
import Celebration from "@/components/Celebration";

const GAME_ID = "slide";

export default function SlideBoard({
  puzzle,
  index,
  onSolved,
}: {
  puzzle: Puzzle;
  index: number;
  onSolved?: (slot: string) => void;
}) {
  const [state, setState] = useState<State>(() => initialState(puzzle, index));
  const [restoredSlot, setRestoredSlot] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [saved, setSaved] = useState<SaveOutcome | null>(null);
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
  }, [slot, puzzle, index]);

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

  const push = useCallback((i: number) => setState((s) => slide(s, i)), []);

  /* arrow keys move the gap */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
      const by: Record<string, [number, number]> = {
        ArrowUp: [1, 0],
        ArrowDown: [-1, 0],
        ArrowLeft: [0, 1],
        ArrowRight: [0, -1],
      };
      const d = by[e.key];
      if (!d) return;
      setState((s) => slideByDirection(s, d[0], d[1]));
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
          <h1>Sliding tiles</h1>
          <div className="strapline">Fifteen numbers and a gap</div>
        </div>
        <div className="badges">
          <span className="pill-no">{puzzle.id.replace("SL-", "NO. ")}</span>
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
                className={["sl-tile", tile === i + 1 ? "home" : "", state.last === tile ? "moved" : ""]
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
        {solved ? "In order. That's the one." : `${home} of ${CELLS - 1} in place`}
      </div>

      <div className="tools">
        <button className="tool" onClick={() => setState(reset(puzzle, index))}>
          Start over
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
