"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import FreeAtroBoard from "./FreeAtroBoard";
import Shop from "./Shop";
import {
  advanceRound,
  bankRound,
  buy,
  dealFor,
  newRun,
  targetFor,
  type Deal,
  type Run,
  type Upgrade,
} from "./engine";
import AuthBar from "@/components/AuthBar";
import { loadProgress, saveProgress } from "@/lib/progress";
import { SITE } from "@/lib/site";

const GAME_ID = "freeatro";
/** One slot for the run itself: there is only ever one on the go. */
const RUN_SLOT = "freeatro:run:v1";

export default function FreeAtroGame({ deals }: { deals: Deal[] }) {
  const [run, setRun] = useState<Run | null>(null);
  /** the score just posted, which is what the shop is reporting on */
  const [justScored, setJustScored] = useState<number | null>(null);

  /* A run in progress outlives a reload — it is the thing being played, not the
     board. Restored before anything renders, so a run is never silently lost to
     a refresh. */
  useEffect(() => {
    let alive = true;
    loadProgress<Run>(RUN_SLOT).then((rec) => {
      if (!alive) return;
      const stored = rec?.entries;
      if (stored && typeof stored.round === "number") {
        setRun(stored);
        return;
      }
      // Written down as it is dealt, not when it is first changed. The offset
      // is random, so a run that was only held in memory dealt different rounds
      // after every reload — the same bug Block Out! had.
      const fresh = newRun(Math.floor(Math.random() * deals.length));
      setRun(fresh);
      void saveProgress<Run>(RUN_SLOT, GAME_ID, fresh, false);
    });
    return () => { alive = false; };
  }, [deals.length]);

  const keep = useCallback((next: Run) => {
    setRun(next);
    void saveProgress<Run>(RUN_SLOT, GAME_ID, next, false);
  }, []);

  /**
   * The round is over: bank it, then show the shop.
   *
   * Banking here rather than on the way out of the shop is what lets the shop
   * spend the money the round just earned. Guarded on `justScored` so a
   * re-render cannot re-enter it, and `bankRound` is itself idempotent for the
   * reload-while-shopping case.
   */
  const onWon = useCallback(
    (score: number) => {
      setJustScored((already) => {
        if (already !== null) return already;
        setRun((r) => {
          if (!r) return r;
          const banked = bankRound(r, score, dealFor(r, deals).ceiling);
          void saveProgress<Run>(RUN_SLOT, GAME_ID, banked, false);
          return banked;
        });
        return score;
      });
    },
    [deals]
  );

  const carryOn = () => {
    if (!run || justScored === null) return;
    // the deal that was just played, not the next one
    const played = dealFor(run, deals);
    // `targetFor` rather than the formula written out again: they matched, which
    // is exactly what makes a duplicate dangerous rather than obviously wrong
    const cleared = justScored >= targetFor(run.round, played.ceiling);
    keep(cleared ? advanceRound(run) : newRun(Math.floor(Math.random() * deals.length)));
    setJustScored(null);
  };

  if (!run) return <main className="shell"><p className="nothingyet">Dealing…</p></main>;

  const deal = dealFor(run, deals);

  return (
    <main className="shell">
      <div className="topbar">
        <Link href="/" className="crumb">← {SITE.name}</Link>
        <Link href="/record" className="crumb">The record</Link>
        <AuthBar gameId={GAME_ID} />
      </div>

      {justScored !== null ? (
        <Shop
          run={run}
          score={justScored}
          ceiling={deal.ceiling}
          onBuy={(id: Upgrade) => keep(buy(run, id))}
          onNext={carryOn}
        />
      ) : (
        <FreeAtroBoard deal={deal} run={run} onWon={onWon} />
      )}
    </main>
  );
}
