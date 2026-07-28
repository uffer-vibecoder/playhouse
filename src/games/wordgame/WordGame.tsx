"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import WordBoard from "./WordBoard";
import { type Puzzle } from "./engine";
import AuthBar from "@/components/AuthBar";
import { loadSolvedSet } from "@/lib/progress";
import { wordgameSlot } from "@/lib/slots";
import { SITE } from "@/lib/site";

const GAME_ID = "wordgame";

/**
 * The picker and the board.
 *
 * No theme filter here, unlike codeword — these puzzles are just words, so the
 * only axis worth navigating is the number and whether you have finished it.
 */
export default function WordGame({ puzzles }: { puzzles: Puzzle[] }) {
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
    [puzzles.length, setIndex]
  );

  const slotOf = (p: Puzzle) =>
    wordgameSlot(p);
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
