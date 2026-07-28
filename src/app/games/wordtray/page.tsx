import { Suspense } from "react";
import TrayGame from "@/games/wordtray/TrayGame";
import type { Puzzle } from "@/games/wordtray/engine";
import puzzles from "@/data/wordtray.json";
import { pageTitle } from "@/lib/site";

/**
 * Crossword construction with no clue writing — the letters are the clue.
 * Every grid here is built only from words its own seven letters spell, and the
 * builder checks that before shipping.
 */
export const metadata = { title: pageTitle("Word Tray") };

export default function WordTrayPage() {
  /* `useSearchParams` needs a boundary: a link may name a tray (`?p=…`). */
  return (
    <Suspense>
      <TrayGame puzzles={puzzles as Puzzle[]} />
    </Suspense>
  );
}
