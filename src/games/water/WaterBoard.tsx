"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Mark from "@/components/Mark";
import {
  DEPTH,
  canPour,
  done as doneTubes,
  initialState,
  isPure,
  isSolved,
  nextPour,
  pour,
  stuck,
  toSave,
  undo as undoPour,
  type Puzzle,
  type Saved,
  type State,
} from "./engine";
import { loadProgress, recordResult, saveProgress, type SaveOutcome } from "@/lib/progress";
import { waterSlot } from "@/lib/slots";
import Celebration from "@/components/Celebration";
import TimerButton from "@/components/TimerButton";
import { useTimer } from "@/lib/use-timer";

const GAME_ID = "water";

/** Hints per board, the same three Word Tray and Jigsaw allow. */
const HINTS = 3;

const TIER_NOTE: Record<string, string> = {
  easy: "Five colours. A gentle one.",
  gentle: "Six colours.",
  steady: "Eight colours — the spare tubes start to matter.",
  tricky: "Ten colours. Think before you pour.",
};

export default function WaterBoard({
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
  /** the tube in hand, if any */
  const [held, setHeld] = useState<number | null>(null);
  /** where colour just landed, and how full that tube was before — so only the
   *  units that actually arrived are animated */
  const [landed, setLanded] = useState<{ tube: number; from: number } | null>(null);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [said, setSaid] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [saved, setSaved] = useState<SaveOutcome | null>(null);
  const solvedOnce = useRef(false);

  const slot = useMemo(() => waterSlot(puzzle), [puzzle]);
  const timer = useTimer(slot);
  const { stop: stopTimer, ms: elapsed } = timer;
  const restoring = restoredSlot !== slot;

  useEffect(() => {
    let alive = true;
    solvedOnce.current = false;
    loadProgress<Saved>(slot).then((rec) => {
      if (!alive) return;
      setState(initialState(puzzle, rec?.entries));
      setHeld(null);
      setLanded(null);
      setHintsUsed(0);
      setSaid(null);
      setCelebrate(false);
      setRestoredSlot(slot);
    });
    return () => { alive = false; };
  }, [slot, puzzle]);

  const solved = isSolved(state);

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
      setHeld(null);
      onSolved?.(slot);
      /* how it went, never the answer — a result must be safe to show someone
         who has not played this board */
      void recordResult(
        slot,
        GAME_ID,
        { colours: puzzle.colours, par: puzzle.par, moves: state.moves, tier: puzzle.tier },
        elapsed
      );
    }
    if (!solved) solvedOnce.current = false;
  }, [solved, restoring, onSolved, slot, puzzle.colours, puzzle.par, puzzle.tier, state.moves, stopTimer, elapsed]);

  useEffect(() => {
    if (!landed) return;
    const id = setTimeout(() => setLanded(null), 400);
    return () => clearTimeout(id);
  }, [landed]);

  useEffect(() => {
    if (!said) return;
    const id = setTimeout(() => setSaid(null), 3500);
    return () => clearTimeout(id);
  }, [said]);

  /**
   * Tap a tube to pick it up, tap another to pour.
   *
   * Deliberately not a drag. Block Out! shipped one without `touch-action:none`
   * and was unplayable on a phone while working perfectly with a mouse; tapping
   * cannot go wrong that way, and it is what the genre does anyway.
   */
  const tap = useCallback(
    (i: number) => {
      if (solved) return;
      setSaid(null);
      if (held === null) {
        // an empty tube has nothing to pour, and a finished one should be left
        if (!state.tubes[i].length) return;
        if (state.tubes[i].length === DEPTH && isPure(state.tubes[i])) return;
        setHeld(i);
        return;
      }
      if (held === i) { setHeld(null); return; } // put it back down
      const next = pour(state, held, i);
      if (next === state) {
        // identity means the pour was not allowed — say so rather than doing
        // nothing, which reads as the tap having been missed
        setSaid("That colour will not go there.");
        setHeld(null);
        return;
      }
      setState(next);
      setLanded({ tube: i, from: state.tubes[i].length });
      setHeld(null);
    },
    [held, state, solved]
  );

  const goBack = useCallback(() => {
    setHeld(null);
    setLanded(null);
    setState((s) => undoPour(s));
  }, []);

  /**
   * A hint pours the next move on a shortest path.
   *
   * Worked out only when asked. `solve` is a breadth-first search and costs
   * around 300ms on a ten-colour board — far too much to run on every render
   * just to decide whether a button should be enabled.
   */
  const askHint = useCallback(() => {
    if (solved || hintsUsed >= HINTS) return;
    const move = nextPour(state);
    if (!move) {
      setSaid("No pour from here gets home — take one back.");
      return;
    }
    setState(pour(state, move[0], move[1]));
    setLanded({ tube: move[1], from: state.tubes[move[1]].length });
    setHeld(null);
    setHintsUsed((n) => n + 1);
  }, [state, solved, hintsUsed]);

  /* the keyboard, for anyone who would rather type than tap */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
      if (/^[1-9]$/.test(e.key)) tap(Number(e.key) - 1);
      else if (e.key === "0") tap(9);
      else if (e.key === "-") tap(10);
      else if (e.key === "=") tap(11);
      else if (e.key === "Escape") setHeld(null);
      else if (e.key === "Backspace") goBack();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tap, goBack]);

  const filled = doneTubes(state);
  const nowhere = stuck(state);

  return (
    <div className="sheet">
      <header>
        <div>
          <h1>Water Sort</h1>
          <div className="titlerow">
            <span className="strapline">One colour to a tube</span>
            <span className="pill-num">{puzzle.id.replace("WS-", "NO. ")}</span>
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
            Tap a tube to pick it up, then tap another to pour. Colour only moves onto the same
            colour, or into an empty tube, and it pours as much as fits. Finish when every tube
            is empty or full of one colour.
          </p>
          <p className="intro">
            Every band carries a small mark as well as a colour, so the board works if the
            colours are hard to tell apart. Two tubes are always spare — that is what makes it
            solvable at all, and every board here was solved before it shipped.
          </p>
          <p className="intro">
            <b>Take back</b> undoes a pour, as many as you like. <b>Hint</b> pours the next move
            on a shortest route — three per board.
          </p>
        </div>
      </details>

      <div className="ws-meta">
        <span className={"ws-tier " + puzzle.tier}>{puzzle.tier}</span>
        <span className="ws-par">
          {TIER_NOTE[puzzle.tier]} Shortest way home is {puzzle.par}.
        </span>
      </div>

      <div className="ws-board" role="group" aria-label={`${puzzle.tubes.length} tubes`}>
        {state.tubes.map((tube, i) => {
          const finished = tube.length === DEPTH && isPure(tube);
          /* while a tube is in hand, say which ones will take it — the rule is
             not hard but counting four units in a glance is, and a refused pour
             is the one thing here that feels like a mistake */
          const takes = held !== null && held !== i && canPour(state.tubes, held, i);
          const cls = [
            "ws-tube",
            held === i ? "up" : "",
            takes ? "can" : "",
            finished ? "done" : "",
          ].filter(Boolean).join(" ");
          return (
            <button
              key={i}
              className={cls}
              onClick={() => tap(i)}
              disabled={solved}
              aria-label={
                tube.length
                  ? `tube ${i + 1}, ${tube.length} of ${DEPTH}${finished ? ", finished" : ""}`
                  : `tube ${i + 1}, empty`
              }
              aria-pressed={held === i}
            >
              {Array.from({ length: DEPTH }, (_, slot) => {
                const colour = tube[slot];
                if (colour === undefined) return <span className="ws-slot" key={slot} />;
                const arriving = landed?.tube === i && slot >= landed.from;
                return (
                  <span
                    key={slot}
                    className={`ws-slot ws-band ws-hue-${colour}${arriving ? " poured" : ""}`}
                  />
                );
              })}
            </button>
          );
        })}
      </div>

      {said && (
        <div className="ws-said" role="status">
          {said}
        </div>
      )}

      {nowhere && !said && (
        <div className="ws-said" role="status">
          Nothing can be poured from here. Take one back.
        </div>
      )}

      <div className="ws-tools noprint">
        <button className="tool" onClick={goBack} disabled={!state.past.length || solved}>
          Take back
        </button>
        <button
          className="tool"
          onClick={askHint}
          disabled={solved || hintsUsed >= HINTS}
          title="Pour the next move on a shortest route"
        >
          Hint · {HINTS - hintsUsed}
        </button>
      </div>

      {celebrate && <Celebration onDone={() => setCelebrate(false)} />}

      <div className="status">
        <span>
          {filled} of {puzzle.colours} sorted · {state.moves} pours
        </span>
        <span>{held === null ? "tap a tube" : "tap where it goes"}</span>
      </div>

      {solved && (
        <div className="win show">
          {state.moves <= puzzle.par
            ? `Sorted in ${state.moves} — that is the shortest way there is.`
            : `Sorted in ${state.moves}. The shortest way is ${puzzle.par}.`}
        </div>
      )}

      <div className="tools">
        <TimerButton timer={timer} solved={solved} />
        <button
          className="tool"
          onClick={() => {
            setState(initialState(puzzle));
            setHeld(null);
            setHintsUsed(0);
          }}
        >
          Start over
        </button>
        <button className="tool" onClick={onNext}>
          Next board
        </button>
      </div>

      <footer>
        <span>Water Sort · every board was solved before it shipped</span>
        <span>{saved?.where === "cloud" ? "Saved to your account" : "Saved on this device"}</span>
      </footer>
    </div>
  );
}
