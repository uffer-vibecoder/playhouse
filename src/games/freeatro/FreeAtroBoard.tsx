"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Mark from "@/components/Mark";
import {
  COLUMNS,
  SUITS,
  autoplay,
  canFinish,
  finish,
  initialState,
  isRed,
  isWon,
  liftFrom,
  name,
  targetFor,
  runLength,
  suitOf,
  toCell,
  toColumn,
  toFoundation,
  toSave,
  undo as undoMove,
  type Deal,
  type Run,
  type Saved,
  type State,
} from "./engine";
import { loadProgress, recordResult, saveProgress, type SaveOutcome } from "@/lib/progress";
import { freeatroSlot } from "@/lib/slots";
import Celebration from "@/components/Celebration";
import TimerButton from "@/components/TimerButton";
import { useTimer } from "@/lib/use-timer";

const GAME_ID = "freeatro";

/** Where a selected card is sitting. */
type Held = { pile: "column" | "cell"; index: number; count: number } | null;

export default function FreeAtroBoard({
  deal,
  run,
  onWon,
}: {
  deal: Deal;
  run: Run;
  onWon: (score: number) => void;
}) {
  const [state, setState] = useState<State>(() => initialState(deal, run));
  const [restoredSlot, setRestoredSlot] = useState<string | null>(null);
  const [held, setHeld] = useState<Held>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [saved, setSaved] = useState<SaveOutcome | null>(null);
  const wonOnce = useRef(false);

  // the round is part of the slot: the same deal at round four is a different
  // problem from the same deal at round one, because the target has moved
  const slot = useMemo(
    () => freeatroSlot(deal, run.round),
    [deal, run.round]
  );
  const timer = useTimer(slot);
  const { stop: stopTimer, ms: elapsed } = timer;
  const restoring = restoredSlot !== slot;
  const target = targetFor(run.round, deal.ceiling);

  useEffect(() => {
    let alive = true;
    wonOnce.current = false;
    loadProgress<Saved>(slot).then((rec) => {
      if (!alive) return;
      setState(initialState(deal, run, rec?.entries));
      setHeld(null);
      setCelebrate(false);
      setRestoredSlot(slot);
    });
    return () => { alive = false; };
  }, [slot, deal, run]);

  const won = isWon(state.table);
  useEffect(() => {
    if (restoring) return;
    const id = setTimeout(() => {
      void saveProgress<Saved>(slot, GAME_ID, toSave(state), won).then(setSaved);
    }, 400);
    return () => clearTimeout(id);
  }, [state, slot, won, restoring]);

  useEffect(() => {
    if (won && !wonOnce.current && !restoring) {
      wonOnce.current = true;
      stopTimer();
      setCelebrate(true);
      /* the score and the moves, never the tableau — a result says how it went,
         not what the cards were */
      void recordResult(
        slot,
        GAME_ID,
        { score: state.score.total, moves: state.moves, round: run.round, target },
        elapsed
      );
      // `onWon` swaps this board for the shop, so it waits for the celebration
      // to finish. It used to fire immediately, which unmounted the board mid
      // first frame — the celebration was there all along and never once seen.
    }
    if (!won) wonOnce.current = false;
  }, [won, restoring, slot, state.score.total, state.moves, run.round, target, stopTimer, elapsed, onWon]);

  /**
   * One tap picks up, the next puts down.
   *
   * Chosen over drag because a tableau column can be twelve cards deep on a
   * phone and dragging from the middle of one is fiddly in a way that loses
   * games. Tapping a column takes as much of its ordered tail as will legally
   * move; tapping the destination drops it.
   */
  const tap = useCallback(
    (pile: "column" | "cell" | "foundation", index: number) => {
      setState((s) => {
        if (pile === "foundation") {
          if (!held) return s;
          const next = toFoundation(s, { pile: held.pile, index: held.index });
          if (next !== s) setHeld(null);
          return next;
        }

        if (!held) {
          if (pile === "cell") {
            if (s.table.cells[index] === null) return s;
            setHeld({ pile: "cell", index, count: 1 });
          } else {
            // Tapping the column itself takes only the bottom card. Which part
            // of a run you move is the decision, so taking more than one is
            // something you have to say by tapping the card you want to start
            // from — see `takeFrom`.
            const col = s.table.columns[index];
            if (!col.length) return s;
            setHeld({ pile: "column", index, count: 1 });
          }
          return s;
        }

        // tapping what you are already holding puts it back down
        if (held.pile === pile && held.index === index) {
          setHeld(null);
          return s;
        }

        if (pile === "cell") {
          if (held.pile !== "column" || held.count !== 1) return s;
          const next = toCell(s, held.index);
          if (next !== s) setHeld(null);
          return next;
        }

        // Exactly what was picked up, or nothing. It used to count down and
        // take whatever fitted, so asking for three and getting one looked like
        // the board had moved a card of its own accord.
        const next = toColumn(s, { pile: held.pile, index: held.index }, index, held.count);
        if (next !== s) setHeld(null);
        return next;
      });
    },
    [held]
  );

  /**
   * Pick up from a particular card: that card and everything below it.
   *
   * Refuses rather than trimming — a pick-up that quietly gave you fewer cards
   * than you touched would be worse than one that does nothing.
   */
  const takeFrom = useCallback((column: number, cardIndex: number) => {
    setState((s) => {
      const count = liftFrom(s.table, column, cardIndex);
      if (count > 0) setHeld({ pile: "column", index: column, count });
      return s;
    });
  }, []);

  const send = () => setState(autoplay);
  /** Only offered once the board is decided — see `canFinish`. */
  const decided = !won && canFinish(state.table);
  const back = () => {
    setHeld(null);
    setState(undoMove);
  };

  const { score } = state;
  const beat = score.total >= target;

  const card = (c: number, extra = "") => (
    <span className={`fa-card${isRed(c) ? " red" : ""}${extra}`} key={c}>
      <span className="fa-rank">{name(c).slice(0, -1)}</span>
      <span className="fa-suit">{SUITS[suitOf(c)]}</span>
    </span>
  );

  return (
    <div className="sheet">
      <header>
        <div>
          <h1>Free-Atro</h1>
          <div className="titlerow">
            <span className="strapline">Freecell, scored · {run.coins} in the purse</span>
            <span className="pill-num">Round {run.round}</span>
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
            Freecell rules: build down in alternating colours, four cells to park a card in, and
            every suit home from ace to king wins it. Tap a pile to pick up, tap another to put
            down. Every deal here has been won by the builder before it shipped, so there is
            always a way through.
          </p>
          <p className="intro">
            <b>The scoring is the twist.</b> A card sent home scores its rank — a king is worth
            thirteen aces — multiplied by what the tableau has earned you. Every run of three or
            more in alternating colours is <b>+1 multiplier</b> while it stands, and each suit
            finished is another. So winning is not the whole game: winning tidily is.
          </p>
        </div>
      </details>

      <div className="fa-score">
        <span className="fa-chips">{score.chips}</span>
        <span className="fa-times">×</span>
        <span className="fa-mult">{score.mult}</span>
        <span className="fa-total">
          <b>{score.total}</b>
          <span>of {target}</span>
        </span>
        <span className="fa-bar" aria-hidden="true">
          <span style={{ width: `${Math.min(100, (score.total / target) * 100)}%` }} />
        </span>
      </div>

      <div className="fa-top">
        <div className="fa-cells">
          {/* from the table, not the constant: a run can buy a fifth cell, and
              rendering four would leave it real but invisible */}
          {state.table.cells.map((c, i) => {
            const on = held?.pile === "cell" && held.index === i;
            return (
              <button
                key={i}
                className={`fa-slot${on ? " on" : ""}`}
                onClick={() => tap("cell", i)}
                aria-label={c === null ? `Empty cell ${i + 1}` : `Cell ${i + 1}, ${name(c)}`}
              >
                {c === null ? <span className="fa-empty">cell</span> : card(c)}
              </button>
            );
          })}
        </div>

        <div className="fa-foundations">
          {Array.from({ length: 4 }, (_, suit) => {
            const top = state.table.foundations[suit];
            return (
              <button
                key={suit}
                className="fa-slot fa-home"
                onClick={() => tap("foundation", suit)}
                aria-label={`${SUITS[suit]} foundation, ${top < 0 ? "empty" : name(suit * 13 + top)}`}
              >
                {top < 0 ? (
                  <span className={`fa-empty${suit === 1 || suit === 2 ? " red" : ""}`}>
                    {SUITS[suit]}
                  </span>
                ) : (
                  card(suit * 13 + top)
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="fa-table">
        {Array.from({ length: COLUMNS }, (_, i) => {
          const col = state.table.columns[i];
          const tail = runLength(col);
          const on = held?.pile === "column" && held.index === i;
          return (
            <button
              key={i}
              className={`fa-col${on ? " on" : ""}`}
              onClick={() => tap("column", i)}
              aria-label={`Column ${i + 1}, ${col.length} cards${col.length ? `, ${name(col.at(-1)!)} on top` : ""}`}
            >
              {col.length === 0 && <span className="fa-gap" />}
              {col.map((c, n) => (
                <span
                  className={`fa-slide${on && n >= col.length - held!.count ? " lift" : ""}${
                    tail >= 3 && n >= col.length - tail ? " inrun" : ""
                  }${liftFrom(state.table, i, n) > 0 ? " takeable" : ""}`}
                  key={c}
                  role="button"
                  tabIndex={liftFrom(state.table, i, n) > 0 ? 0 : -1}
                  aria-label={`${name(c)}${
                    liftFrom(state.table, i, n) > 1
                      ? `, take ${liftFrom(state.table, i, n)} cards from here`
                      : ""
                  }`}
                  onClick={(e) => {
                    // the column behind is a drop target; a tap on a card is a
                    // pick-up, so it must not also count as a drop
                    if (held) return;
                    e.stopPropagation();
                    takeFrom(i, n);
                  }}
                >
                  {card(c)}
                </span>
              ))}
            </button>
          );
        })}
      </div>

      {celebrate && (
        <Celebration
          onDone={() => {
            setCelebrate(false);
            onWon(state.score.total);
          }}
        />
      )}

      <div className="status">
        <span>{state.moves} moves</span>
        <span>
          {held
            ? `holding ${held.count} card${held.count === 1 ? "" : "s"}`
            : "tap a card to pick up from there"}
        </span>
      </div>

      {won && (
        <div className="win show">
          {beat
            ? `Home in ${state.moves}, and ${score.total} beats ${target}.`
            : `Home in ${state.moves} for ${score.total} — the target was ${target}.`}
        </div>
      )}

      <div className="tools">
        <TimerButton timer={timer} solved={won} />
        <button className="tool" onClick={back} disabled={!state.past.length}>
          Back
        </button>
        <button className="tool" onClick={send}>
          Send home
        </button>
        {decided && (
          <button className="tool fa-finish" onClick={() => setState(finish)}>
            Finish it
          </button>
        )}
        <button className="tool" onClick={() => setState(initialState(deal, run))}>
          Start over
        </button>
      </div>

      <footer>
        <span>Free-Atro · round {run.round} · every deal has been won before it shipped</span>
        <span>{saved?.where === "cloud" ? "Saved to your account" : "Saved on this device"}</span>
      </footer>
    </div>
  );
}
