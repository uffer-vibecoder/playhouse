"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import FreeAtroBoard from "./FreeAtroBoard";
import type { Deal } from "./engine";
import AuthBar from "@/components/AuthBar";
import { fingerprint, loadSolvedSet, slotKey } from "@/lib/progress";
import { SITE } from "@/lib/site";

const GAME_ID = "freeatro";

const slotOf = (d: Deal) => slotKey(GAME_ID, d.id, fingerprint([[d.seed]], String(d.seed)));

export default function FreeAtroGame({ deals }: { deals: Deal[] }) {
  const want = useSearchParams().get("p");
  const [picked, setPicked] = useState<number | null>(null);
  const asked = want ? deals.findIndex((d) => d.id === want) : -1;
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

  const goNext = useCallback(
    () => setIndex((i) => (i + 1) % deals.length),
    [deals.length, setIndex]
  );

  const doneCount = deals.filter((d) => solved.has(slotOf(d))).length;
  const deal = deals[index];

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
            Choose a deal
            <span className="sum-note">
              {deal.id.replace("FA-", "DEAL ")} of {deals.length}
              {doneCount ? ` · ${doneCount} won` : ""}
            </span>
          </summary>
          <div className="disclosure-body">
            <div className="tabs">
              {deals.map((d, i) => (
                <button
                  key={d.id}
                  className="tab"
                  aria-current={i === index ? "true" : undefined}
                  onClick={() => {
                    setIndex(i);
                    setPickerOpen(false);
                  }}
                  title={`a route home in ${d.route} moves exists`}
                >
                  {d.id.replace("FA-", "")}
                  {solved.has(slotOf(d)) ? " ✓" : ""}
                </button>
              ))}
            </div>
          </div>
        </details>
      </div>

      <FreeAtroBoard deal={deal} onNext={goNext} />
    </main>
  );
}
