"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import SlideBoard from "./SlideBoard";
import type { Puzzle } from "./engine";
import AuthBar from "@/components/AuthBar";
import { fingerprint, loadSolvedSet, slotKey } from "@/lib/progress";
import { SITE } from "@/lib/site";

const GAME_ID = "slide";

export default function SlideGame({ puzzles }: { puzzles: Puzzle[] }) {
  const [index, setIndex] = useState(0);
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
    [puzzles.length]
  );

  const slotOf = (p: Puzzle) =>
    slotKey(GAME_ID, p.id, fingerprint([[p.seed]], String(p.seed)));
  const doneCount = puzzles.filter((p) => solved.has(slotOf(p))).length;

  return (
    <main className="shell">
      <div className="topbar">
        <Link href="/" className="crumb">
          ← {SITE.name}
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
            Choose a board
            <span className="sum-note">
              {puzzle.id.replace("SL-", "NO. ")} of {puzzles.length}
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
                  {p.id.replace("SL-", "NO. ")}
                  {solved.has(slotOf(p)) ? " ✓" : ""}
                </button>
              ))}
            </div>
          </div>
        </details>
      </div>

      {/* index drives how far the board starts from solved — see scrambleDepth */}
      <SlideBoard puzzle={puzzle} index={index} onSolved={markSolved} onNext={goNext} />
    </main>
  );
}
