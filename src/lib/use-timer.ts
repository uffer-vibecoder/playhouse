"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * An optional clock.
 *
 * It **never starts on its own.** That is the whole design and not a detail:
 * the site's promise is that nothing here nags, and a timer that begins the
 * moment a puzzle opens turns every sitting into a race whether or not you
 * wanted one. You ask for it, or there is no time.
 *
 * Which is why a null elapsed time is the ordinary case rather than a gap, and
 * why every reader shows it as an em dash at full legibility rather than as a
 * zero or as nothing at all.
 *
 * Wall-clock deltas rather than counted ticks: an interval that fires late — a
 * background tab, a sleeping laptop — would otherwise lose time silently. The
 * interval only decides how often the display refreshes.
 */
export type Timer = {
  /** Milliseconds, or null if it was never asked for. */
  ms: number | null;
  running: boolean;
  start: () => void;
  stop: () => void;
  reset: () => void;
};

/**
 * One state object rather than four.
 *
 * `now` lives in here too, which is what keeps the elapsed figure out of the
 * render body: reading `Date.now()` while rendering is impure and gives React
 * licence to show two different times in one paint. The clock is advanced by
 * the interval and by the handlers, and render only subtracts.
 */
type Run = {
  slot: string;
  /** when the current stretch began, or null if paused or never started */
  startedAt: number | null;
  /** completed stretches, in ms */
  banked: number;
  /** has it ever been asked for — the difference between "—" and "0:00" */
  asked: boolean;
  now: number;
};

const fresh = (slot: string): Run => ({ slot, startedAt: null, banked: 0, asked: false, now: 0 });

export function useTimer(slot: string): Timer {
  const [stored, setRun] = useState<Run | null>(null);

  /**
   * A new puzzle is a new clock; carrying one across would time the wrong
   * thing. The run records which slot it belongs to and a run for any other
   * slot is simply ignored — no reset, no effect, nothing written during
   * render. An earlier version adjusted state during render, which is a
   * sanctioned React pattern but broke hydration on every board page: the
   * tree never attached, so *no* button on a puzzle worked, not just this one.
   */
  const run = stored && stored.slot === slot ? stored : null;
  const startedAt = run?.startedAt ?? null;

  useEffect(() => {
    if (startedAt === null) return;
    const id = setInterval(
      () => setRun((r) => (r ? { ...r, now: Date.now() } : r)),
      500
    );
    return () => clearInterval(id);
  }, [startedAt]);

  const start = useCallback(() => {
    const at = Date.now();
    setRun((r) => {
      const base = r && r.slot === slot ? r : fresh(slot);
      return base.startedAt !== null ? base : { ...base, startedAt: at, asked: true, now: at };
    });
  }, [slot]);

  const stop = useCallback(() => {
    const at = Date.now();
    setRun((r) =>
      !r || r.slot !== slot || r.startedAt === null
        ? r
        : { ...r, banked: r.banked + (at - r.startedAt), startedAt: null, now: at }
    );
  }, [slot]);

  const reset = useCallback(() => setRun(fresh(slot)), [slot]);

  const live =
    !run ? 0
    : run.startedAt === null ? run.banked
    : run.banked + Math.max(0, run.now - run.startedAt);

  return {
    ms: run?.asked ? live : null,
    running: startedAt !== null,
    start,
    stop,
    reset,
  };
}

/** `4:12`, or `1:02:30` once it has been going an hour. */
export function clock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
