import { Suspense } from "react";
import SlideGame from "@/games/slide/SlideGame";
import type { Puzzle } from "@/games/slide/engine";
import puzzles from "@/data/slide.json";
import { pageTitle } from "@/lib/site";

/**
 * One integer per puzzle. The starting board is walked out from the solved
 * arrangement using that seed, which is also what guarantees every board can
 * actually be solved — half of all random arrangements cannot be.
 */
export const metadata = { title: pageTitle("Sliding Tiles") };

export default function SlidePage() {
  /* `useSearchParams` needs a boundary: a link may name a puzzle
   (`?p=…`), and reading the query is what stops this page prerendering. */
  return (
    <Suspense>
      <SlideGame puzzles={puzzles as Puzzle[]} />
    </Suspense>
  );
}
