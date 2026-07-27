"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import WordBoard from "./WordBoard";
import { LENGTH, TRIES, type Puzzle } from "./engine";
import AuthBar from "@/components/AuthBar";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { fingerprint, loadSolvedSet, slotKey } from "@/lib/progress";
import { SITE } from "@/lib/site";

const GAME_ID = "wordgame";

/**
 * The picker and the board.
 *
 * No theme filter here, unlike codeword — these puzzles are just words, so the
 * only axis worth navigating is the number and whether you have finished it.
 */
export default function WordGame({ puzzles }: { puzzles: Puzzle[] }) {
  const [index, setIndex] = useState(0);
  const [solved, setSolved] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);

  const puzzle = puzzles[index];

  useEffect(() => {
    void loadSolvedSet(GAME_ID).then(setSolved);
  }, []);

  /**
   * Tick it the moment it is finished, from the slot the board hands over —
   * re-reading storage here would race the debounced save and come back empty.
   * See the same note in CodewordGame.
   */
  const markSolved = useCallback((slot: string) => {
    setSolved((prev) => (prev.has(slot) ? prev : new Set(prev).add(slot)));
  }, []);

  /** Wraps at the end, so the last puzzle still has somewhere to go. */
  const goNext = useCallback(
    () => setIndex((i) => (i + 1) % puzzles.length),
    [puzzles.length]
  );

  const slotOf = (p: Puzzle) =>
    slotKey(GAME_ID, p.id, fingerprint([[LENGTH, TRIES]], p.answer));
  const doneCount = puzzles.filter((p) => solved.has(slotOf(p))).length;

  return (
    <main className="shell">
      <div className="topbar">
        <Link href="/" className="crumb">
          ← {SITE.name}
        </Link>
        <ThemeSwitcher />
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
              {puzzle.id.replace("WG-", "NO. ")} of {puzzles.length}
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
                  {p.id.replace("WG-", "NO. ")}
                  {solved.has(slotOf(p)) ? " ✓" : ""}
                </button>
              ))}
            </div>
          </div>
        </details>
      </div>

      <WordBoard puzzle={puzzle} onSolved={markSolved} onNext={goNext} />
    </main>
  );
}
