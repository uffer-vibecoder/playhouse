import { Suspense } from "react";
import CodewordGame from "@/games/codeword/CodewordGame";
import type { Puzzle } from "@/games/codeword/engine";
import puzzles from "@/data/codeword.json";
import { pageTitle } from "@/lib/site";

/**
 * Puzzles are static content, so they are imported as a module rather than read
 * off disk — bundled, cached, and independent of where the server process
 * happens to have been started. Player state is the dynamic half, and that is
 * what Postgres holds.
 *
 * The payload deliberately carries no answer list: the grid and key are all the
 * board needs, and shipping `words` would hand the solution to anyone who opens
 * devtools.
 */
export const metadata = { title: pageTitle("Codeword") };

export default function CodewordPage() {
  /* `useSearchParams` needs a boundary: a link may name a puzzle
   (`?p=…`), and reading the query is what stops this page prerendering. */
  return (
    <Suspense>
      <CodewordGame puzzles={puzzles as Puzzle[]} />
    </Suspense>
  );
}
