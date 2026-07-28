"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import TrayBoard from "./TrayBoard";
import type { Puzzle } from "./engine";
import AuthBar from "@/components/AuthBar";
import { loadSolvedSet } from "@/lib/progress";
import { wordtraySlot } from "@/lib/slots";
import { SITE } from "@/lib/site";

const GAME_ID = "wordtray";

const slotOf = (p: Puzzle) =>
  wordtraySlot(p);

export default function TrayGame({ puzzles }: { puzzles: Puzzle[] }) {
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

  useEffect(() => {
    void loadSolvedSet(GAME_ID).then(setSolved);
  }, []);

  const markSolved = useCallback((slot: string) => {
    setSolved((prev) => (prev.has(slot) ? prev : new Set(prev).add(slot)));
  }, []);

  const goNext = useCallback(
    () => setIndex((i) => (i + 1) % puzzles.length),
    [puzzles.length, setIndex]
  );

  const doneCount = puzzles.filter((p) => solved.has(slotOf(p))).length;
  const puzzle = puzzles[index];

  return (
    <main className="shell">
      <div className="topbar">
        <Link href="/" className="crumb">← {SITE.name}</Link>
        <Link href="/record" className="crumb">The record</Link>
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
            Choose a tray
            <span className="sum-note">
              {puzzle.id.replace("WT-", "NO. ")} of {puzzles.length}
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
                  title={`${p.words.length} words, ${p.bonus.length} bonus`}
                >
                  {p.id.replace("WT-", "")}
                  {solved.has(slotOf(p)) ? " ✓" : ""}
                </button>
              ))}
            </div>
          </div>
        </details>
      </div>

      <TrayBoard puzzle={puzzle} onSolved={markSolved} onNext={goNext} />
    </main>
  );
}
