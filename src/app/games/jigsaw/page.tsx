import { Suspense } from "react";
import JigsawGame from "@/games/jigsaw/JigsawGame";
import type { Puzzle } from "@/games/jigsaw/engine";
import puzzles from "@/data/jigsaw.json";
import { pageTitle } from "@/lib/site";

/**
 * Sudoku with the nine boxes cut into nine shapes. Every board here has exactly
 * one answer *and* can be reasoned to the end without a guess — the second part
 * is the harder promise, and it is checked before anything ships.
 */
export const metadata = { title: pageTitle("Jigsaw Sudoku") };

export default function JigsawPage() {
  /* `useSearchParams` needs a boundary: a link may name a board (`?p=…`). */
  return (
    <Suspense>
      <JigsawGame puzzles={puzzles as Puzzle[]} />
    </Suspense>
  );
}
