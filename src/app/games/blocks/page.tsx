import { Suspense } from "react";
import BlocksGame from "@/games/blocks/BlocksGame";
import type { Puzzle } from "@/games/blocks/engine";
import puzzles from "@/data/blocks.json";
import { pageTitle } from "@/lib/site";

/**
 * Every board here was solved before it shipped: the generator searches it
 * breadth-first and records the shortest solution as `par`. So "this can be
 * cleared" is a proof rather than a hope, and par is a measured number rather
 * than an estimate.
 */
export const metadata = { title: pageTitle("Colour Blocks") };

export default function BlocksPage() {
  /* `useSearchParams` needs a boundary: a link may name a board (`?p=…`), and
     reading the query is what stops this page prerendering. */
  return (
    <Suspense>
      <BlocksGame puzzles={puzzles as Puzzle[]} />
    </Suspense>
  );
}
