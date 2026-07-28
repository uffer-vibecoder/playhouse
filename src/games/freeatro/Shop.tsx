"use client";

import { UPGRADES, owned, purse, targetFor, type Run } from "./engine";

/**
 * Between rounds.
 *
 * The whole reason the game is a run rather than a deal: what you won last
 * round buys what you take into the next one. Kept to three things, each doing
 * something obviously different — more room, a better start, or more money —
 * because a shop with a dozen near-identical options is a reading exercise
 * rather than a decision.
 *
 * Prices are flat and the maximums are low. Upgrades that compound without
 * limit turn a run into a formality by round four.
 */
export default function Shop({
  run,
  score,
  onBuy,
  onNext,
}: {
  run: Run;
  score: number;
  onBuy: (id: (typeof UPGRADES)[number]["id"]) => void;
  onNext: () => void;
}) {
  const target = targetFor(run.round);
  const won = score >= target;
  const earned = purse(run, score, run.round);

  return (
    <div className="sheet fa-shop">
      <header>
        <div>
          <h1>{won ? "Round cleared" : "Round over"}</h1>
          <div className="titlerow">
            <span className="strapline">
              {won ? `${score} against ${target}` : `${score} — the target was ${target}`}
            </span>
          </div>
        </div>
      </header>

      <p className="intro">
        {won
          ? `That is ${earned} coin${earned === 1 ? "" : "s"} in the purse.`
          : "No coins this time — the purse pays for clearing a round, not for playing one."}
      </p>

      <div className="fa-purse">
        <b>{run.coins}</b>
        <span>coin{run.coins === 1 ? "" : "s"} to spend</span>
      </div>

      <div className="fa-wares">
        {UPGRADES.map((u) => {
          const have = owned(run, u.id);
          const maxed = have >= u.max;
          const canAfford = run.coins >= u.cost;
          return (
            <button
              key={u.id}
              className="fa-ware"
              onClick={() => onBuy(u.id)}
              disabled={maxed || !canAfford}
            >
              <span className="fa-warename">{u.name}</span>
              <span className="fa-warenote">{u.note}</span>
              <span className="fa-warecost">
                {maxed ? "all bought" : `${u.cost} coins`}
                {have > 0 && !maxed ? ` · ${have} of ${u.max}` : ""}
              </span>
            </button>
          );
        })}
      </div>

      <div className="tools">
        <button className="tool" onClick={onNext}>
          {won ? `Round ${run.round + 1}` : "Start a new run"}
        </button>
      </div>
    </div>
  );
}
