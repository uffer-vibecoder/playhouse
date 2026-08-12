import { Suspense } from "react";
import WaterGame from "@/games/water/WaterGame";
import type { Puzzle } from "@/games/water/engine";
import puzzles from "@/data/water.json";
import { pageTitle } from "@/lib/site";

/**
 * Pour colour between tubes until each holds one colour. Every board was dealt
 * at random and then *proved* — `par` is the shortest solution, found
 * breadth-first, not merely some solution that happened to work.
 */
export const metadata = { title: pageTitle("Water Sort") };

export default function WaterPage() {
  /* `useSearchParams` needs a boundary: a link may name a board (`?p=…`). */
  return (
    <Suspense>
      <WaterGame puzzles={puzzles as Puzzle[]} />
    </Suspense>
  );
}
