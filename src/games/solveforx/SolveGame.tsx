"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import SolveBoard from "./SolveBoard";
import type { Puzzle, Tier } from "./engine";
import AuthBar from "@/components/AuthBar";
import { loadSolvedSet } from "@/lib/progress";
import { solveforxSlot } from "@/lib/slots";
import { SITE } from "@/lib/site";

const GAME_ID = "solveforx";

export default function SolveGame({ puzzles }: { puzzles: Puzzle[] }) {
  /**
   * Which puzzle is open, and where "open on this one" comes from.
   *
   * A link may name a puzzle — `?p=SL-034`, which is how the contents page
   * carries you back to what you left unfinished. That is derived rather than
   * copied into state on mount: an effect that set the index would render the
   * first puzzle, then replace it, and the puzzle you asked for would be the
   * second thing you saw. Once the picker is used, its choice wins.
   */
  const want = useSearchParams().get("p");
  const [picked, setPicked] = useState<number | null>(null);
  const asked = want ? puzzles.findIndex((p) => p.id === want) : -1;
  const index = picked ?? (asked >= 0 ? asked : 0);
  const setIndex = useCallback(
    (v: number | ((i: number) => number)) =>
      setPicked((prev) => {
        const cur = prev ?? 0;
        return typeof v === "function" ? v(cur) : v;
      }),
    []
  );
  /**
   * Which tier the picker is showing. 240 sets across three bands is a wall of
   * pills otherwise, and the bands are genuinely different games rather than
   * degrees of the same one.
   */
  const [tier, setTier] = useState<Tier | null>(null);
  const matches = useCallback(
    (p: Puzzle) => tier === null || (p.tier ?? "easy") === tier,
    [tier]
  );

  const [solved, setSolved] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);

  const puzzle = puzzles[index];

  useEffect(() => {
    void loadSolvedSet(GAME_ID).then(setSolved);
  }, []);

  /* tick immediately from the slot the board provides — see CodewordGame */
  const markSolved = useCallback((slot: string) => {
    setSolved((prev) => (prev.has(slot) ? prev : new Set(prev).add(slot)));
  }, []);

  const countFor = (t: Tier | null) =>
    puzzles.filter((p) => t === null || (p.tier ?? "easy") === t).length;

  /**
   * Switching band moves you to the first set in it. Staying put would leave
   * the filter saying "hard" over a board that is plainly not.
   */
  const chooseTier = (t: Tier | null) => {
    setTier(t);
    const visible = puzzles.map((p, i) => [p, i] as const).filter(([p]) =>
      t === null || (p.tier ?? "easy") === t
    );
    if (!visible.some(([, i]) => i === index) && visible.length) setIndex(visible[0][1]);
  };

  /** Wraps at the end, within whichever band the picker is showing. */
  const goNext = useCallback(() => {
    setIndex((i) => {
      const visible = puzzles.map((p, n) => [p, n] as const).filter(([p]) => matches(p));
      if (!visible.length) return i;
      const at = visible.findIndex(([, n]) => n === i);
      return visible[(at + 1) % visible.length][1];
    });
  }, [puzzles, matches, setIndex]);

  const slotOf = (p: Puzzle) =>
    solveforxSlot(p);
  const doneCount = puzzles.filter((p) => solved.has(slotOf(p))).length;

  return (
    <main className="shell">
      <div className="topbar">
        <Link href="/" className="crumb">
          ← {SITE.name}
        </Link>
        <Link href="/record" className="crumb">
          The record
        </Link>
        <AuthBar gameId={GAME_ID} />
      </div>

      <div className="sheet" style={{ marginBottom: 14 }}>
        <details
          className="disclosure noprint"
          open={pickerOpen}
          onToggle={(e) => setPickerOpen((e.target as HTMLDetailsElement).open)}
          style={{ borderTop: 0, marginTop: 0 }}
        >
          <summary>
            <span className="chev" />
            Choose a set
            <span className="sum-note">
              {puzzle.id.replace("SX-", "NO. ")} · {puzzle.tier ?? "easy"}
              {doneCount ? ` · ${doneCount} done` : ""}
            </span>
          </summary>
          <div className="disclosure-body">
            <div className="filters">
              {([null, "easy", "medium", "hard"] as (Tier | null)[]).map((t) => (
                <button
                  key={t ?? "all"}
                  className="filter"
                  aria-pressed={tier === t}
                  onClick={() => chooseTier(t)}
                >
                  {t === null ? "All" : t[0].toUpperCase() + t.slice(1)} {countFor(t)}
                </button>
              ))}
            </div>
            <div className="tabs">
              {puzzles.map((p, i) =>
                matches(p) ? (
                <button
                  key={p.id}
                  className="tab"
                  aria-current={i === index ? "true" : undefined}
                  onClick={() => {
                    setIndex(i);
                    setPickerOpen(false);
                  }}
                  title={`${p.tier ?? "easy"}${solved.has(slotOf(p)) ? " · finished" : ""}`}
                >
                  {p.id.replace("SX-", "NO. ")}
                  {solved.has(slotOf(p)) ? " ✓" : ""}
                </button>
                ) : null
              )}
            </div>
          </div>
        </details>
      </div>

      <SolveBoard puzzle={puzzle} onSolved={markSolved} onNext={goNext} />
    </main>
  );
}
