"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import CryptoBoard from "./CryptoBoard";
import type { Puzzle } from "./engine";
import AuthBar from "@/components/AuthBar";
import { fingerprint, loadSolvedSet, slotKey } from "@/lib/progress";
import { SITE } from "@/lib/site";

const GAME_ID = "cryptogram";

export default function CryptoGame({ puzzles }: { puzzles: Puzzle[] }) {
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

  /** Wraps at the end, so the last puzzle still has somewhere to go. */
  const goNext = useCallback(
    () => setIndex((i) => (i + 1) % puzzles.length),
    [puzzles.length, setIndex]
  );

  const slotOf = (p: Puzzle) =>
    slotKey(GAME_ID, p.id, fingerprint([[p.key.length]], p.key));
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
            Choose a puzzle
            <span className="sum-note">
              {puzzle.id.replace("CG-", "NO. ")} of {puzzles.length}
              {doneCount ? ` · ${doneCount} done` : ""}
            </span>
          </summary>
          <div className="disclosure-body">
            <div className="tabs">
              {puzzles.map((p, i) => (
                <button
                  key={p.id}
                  className="tab"
                  aria-current={i === index ? "true" : undefined}
                  onClick={() => {
                    setIndex(i);
                    setPickerOpen(false);
                  }}
                  title={solved.has(slotOf(p)) ? "Finished" : undefined}
                >
                  {p.id.replace("CG-", "NO. ")}
                  {solved.has(slotOf(p)) ? " ✓" : ""}
                </button>
              ))}
            </div>
          </div>
        </details>
      </div>

      <CryptoBoard puzzle={puzzle} onSolved={markSolved} onNext={goNext} />
    </main>
  );
}
