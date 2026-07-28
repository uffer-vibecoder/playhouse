"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import BlockBoard from "./BlockBoard";
import AuthBar from "@/components/AuthBar";
import { loadProgress, saveProgress } from "@/lib/progress";
import { SITE } from "@/lib/site";

const GAME_ID = "blockout";
/** One slot for which run is on the go. */
const RUN_SLOT = "blockout:run:v1";

type Which = { run: number; seed: number };

/**
 * Block Out! is a run, not an archive.
 *
 * There is no picker because there is nothing to pick: a run is a number and a
 * seed, and the only navigation is starting another one. Both are kept so a
 * run survives a reload and so "run 31" means the same pieces to anyone who
 * plays it.
 */
export default function BlockGame() {
  const [which, setWhich] = useState<Which | null>(null);

  useEffect(() => {
    let alive = true;
    loadProgress<Which>(RUN_SLOT).then((rec) => {
      if (!alive) return;
      const stored = rec?.entries;
      setWhich(
        stored && typeof stored.run === "number"
          ? stored
          : { run: 1, seed: Math.floor(Math.random() * 2 ** 31) }
      );
    });
    return () => { alive = false; };
  }, []);

  const newRun = useCallback(() => {
    setWhich((w) => {
      const next = { run: (w?.run ?? 0) + 1, seed: Math.floor(Math.random() * 2 ** 31) };
      void saveProgress<Which>(RUN_SLOT, GAME_ID, next, false);
      return next;
    });
  }, []);

  return (
    <main className="shell">
      <div className="topbar">
        <Link href="/" className="crumb">← {SITE.name}</Link>
        <Link href="/record" className="crumb">The record</Link>
        <AuthBar gameId={GAME_ID} />
      </div>

      {which ? (
        <BlockBoard seed={which.seed} run={which.run} onNewRun={newRun} />
      ) : (
        <p className="nothingyet">Shuffling…</p>
      )}
    </main>
  );
}
