"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import JigsawBoard from "./JigsawBoard";
import type { Puzzle, Tier } from "./engine";
import AuthBar from "@/components/AuthBar";
import { fingerprint, loadSolvedSet, slotKey } from "@/lib/progress";
import { SITE } from "@/lib/site";

const GAME_ID = "jigsaw";

const slotOf = (p: Puzzle) =>
  slotKey(GAME_ID, p.id, fingerprint([p.given], p.regions.join("")));

const TIERS: Tier[] = ["gentle", "steady", "tricky"];

export default function JigsawGame({ puzzles }: { puzzles: Puzzle[] }) {
  /**
   * Which board is open. Derived from `?p=` rather than set by an effect — see
   * the note in CodewordGame; the short of it is that an effect would render
   * board one first and replace it.
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

  /** Wraps at the end, so the last board still has somewhere to go. */
  const goNext = useCallback(
    () => setIndex((i) => (i + 1) % puzzles.length),
    [puzzles.length, setIndex]
  );

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
            Choose a board
            <span className="sum-note">
              {puzzle.id.replace("JS-", "NO. ")} of {puzzles.length}
              {doneCount ? ` · ${doneCount} done` : ""}
            </span>
          </summary>
          <div className="disclosure-body">
            {/* grouped by how hard, because that is the only reason to pick one
                board over another here — they are otherwise interchangeable */}
            {TIERS.map((tier) => {
              const inTier = puzzles
                .map((p, i) => ({ p, i }))
                .filter(({ p }) => p.tier === tier);
              if (!inTier.length) return null;
              return (
                <div key={tier} className="js-group">
                  <span className="js-grouphead">
                    {tier} · {inTier.length}
                  </span>
                  <div className="tabs">
                    {inTier.map(({ p, i }) => (
                      <button
                        key={p.id}
                        className="tab"
                        aria-current={i === index ? "true" : undefined}
                        onClick={() => {
                          setIndex(i);
                          setPickerOpen(false);
                        }}
                        title={`${p.clues} clues`}
                      >
                        {p.id.replace("JS-", "NO. ")}
                        {solved.has(slotOf(p)) ? " ✓" : ""}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      </div>

      <JigsawBoard puzzle={puzzle} onSolved={markSolved} onNext={goNext} />
    </main>
  );
}
