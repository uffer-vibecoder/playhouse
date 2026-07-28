"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Mark from "@/components/Mark";
import {
  CELLS,
  COLUMNS,
  SUITS,
  autoplay,
  initialState,
  isRed,
  isWon,
  liftLimit,
  name,
  runLength,
  suitOf,
  toCell,
  toColumn,
  toFoundation,
  toSave,
  undo as undoMove,
  type Deal,
  type Saved,
  type State,
} from "./engine";
import { fingerprint, loadProgress, recordResult, saveProgress, slotKey, type SaveOutcome } from "@/lib/progress";
import Celebration from "@/components/Celebration";
import TimerButton from "@/components/TimerButton";
import { useTimer } from "@/lib/use-timer";

const GAME_ID = "freeatro";

/** Where a selected card is sitting. */
type Held = { pile: "column" | "cell"; index: number; count: number } | null;

export default function FreeAtroBoard({ deal, onNext }: { deal: Deal; onNext?: () => void }) {
  const [state, setState] = useState<State>(() => initialState(deal));
  const [restoredSlot, setRestoredSlot] = useState<string | null>(null);
  const [held, setHeld] = useState<Held>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [saved, setSaved] = useState<SaveOutcome | null>(null);
  const wonOnce = useRef(false);

  const slot = useMemo(
    () => slotKey(GAME_ID, deal.id, fingerprint([[deal.seed]], String(deal.seed))),
    [deal]
  );
  const timer = useTimer(slot);
  const { stop: stopTimer, ms: elapsed } = timer;
  const restoring = restoredSlot !== slot;

  useEffect(() => {
    let alive = true;
    wonOnce.current = false;
    loadProgress<Saved>(slot).then((rec) => {
      if (!alive) return;
      setState(initialState(deal, rec?.entries));
      setHeld(null);
      setCelebrate(false);
      setRestoredSlot(slot);
    });
    return () => { alive = false; };
  }, [slot, deal]);

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
        { score: state.score.total, moves: state.moves, target: deal.target },
        elapsed
      );
    }
    if (!won) wonOnce.current = false;
  }, [won, restoring, slot, state.score.total, state.moves, deal.target, stopTimer, elapsed]);

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
            const col = s.table.columns[index];
            if (!col.length) return s;
            setHeld({ pile: "column", index, count: Math.min(runLength(col), liftLimit(s.table)) });
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

        // try the whole held run, then progressively less of it
        for (let n = held.count; n >= 1; n--) {
          const next = toColumn(s, { pile: held.pile, index: held.index }, index, n);
          if (next !== s) {
            setHeld(null);
            return next;
          }
        }
        return s;
      });
    },
    [held]
  );

  const send = () => setState(autoplay);
  const back = () => {
    setHeld(null);
    setState(undoMove);
  };

  const { score } = state;
  const beat = score.total >= deal.target;

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
            <span className="strapline">Freecell, scored</span>
            <span className="pill-num">{deal.id.replace("FA-", "DEAL ")}</span>
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
          <span>of {deal.target}</span>
        </span>
        <span className="fa-bar" aria-hidden="true">
          <span style={{ width: `${Math.min(100, (score.total / deal.target) * 100)}%` }} />
        </span>
      </div>

      <div className="fa-top">
        <div className="fa-cells">
          {Array.from({ length: CELLS }, (_, i) => {
            const c = state.table.cells[i];
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
                  }`}
                  key={c}
                  style={{ marginTop: n === 0 ? 0 : undefined }}
                >
                  {card(c)}
                </span>
              ))}
            </button>
          );
        })}
      </div>

      {celebrate && <Celebration onDone={() => setCelebrate(false)} />}

      <div className="status">
        <span>{state.moves} moves</span>
        <span>{held ? `holding ${held.count}` : "tap a pile to pick up"}</span>
      </div>

      {won && (
        <div className="win">
          {beat
            ? `Home in ${state.moves}, and ${score.total} beats ${deal.target}.`
            : `Home in ${state.moves} for ${score.total} — the target was ${deal.target}. Tidier next time.`}
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
        <button className="tool" onClick={() => setState(initialState(deal))}>
          Start over
        </button>
        <button className="tool" onClick={onNext}>
          Next deal
        </button>
      </div>

      <footer>
        <span>Free-Atro · every deal has been won before it shipped</span>
        <span>{saved?.where === "cloud" ? "Saved to your account" : "Saved on this device"}</span>
      </footer>
    </div>
  );
}
