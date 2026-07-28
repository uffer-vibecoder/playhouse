"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import FreeAtroBoard from "./FreeAtroBoard";
import Shop from "./Shop";
import {
  dealFor,
  newRun,
  nextRound,
  buy,
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
      setRun(
        stored && typeof stored.round === "number"
          ? stored
          : // where in the archive this run begins; every run is a different
            // sequence of deals, each one reproducible from its own offset
            newRun(Math.floor(Math.random() * deals.length))
      );
    });
    return () => { alive = false; };
  }, [deals.length]);

  const keep = useCallback((next: Run) => {
    setRun(next);
    void saveProgress<Run>(RUN_SLOT, GAME_ID, next, false);
  }, []);

  const onWon = useCallback((score: number) => setJustScored(score), []);

  const carryOn = () => {
    if (!run || justScored === null) return;
    const cleared = justScored >= 240 + (run.round - 1) * 70;
    keep(cleared ? nextRound(run, justScored) : newRun(Math.floor(Math.random() * deals.length)));
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
          onBuy={(id: Upgrade) => keep(buy(run, id))}
          onNext={carryOn}
        />
      ) : (
        <FreeAtroBoard deal={deal} run={run} onWon={onWon} />
      )}
    </main>
  );
}
