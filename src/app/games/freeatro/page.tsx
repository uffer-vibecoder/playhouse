import { Suspense } from "react";
import FreeAtroGame from "@/games/freeatro/FreeAtroGame";
import type { Deal } from "@/games/freeatro/engine";
import deals from "@/data/freeatro.json";
import { pageTitle } from "@/lib/site";

/**
 * Freecell with a scoring layer over it. Balatro was the inspiration for the
 * chips-and-multiplier idea and nothing else — the tableau, the rules and the
 * scoring are ours.
 *
 * Every deal here was won by the solver before it shipped.
 */
export const metadata = { title: pageTitle("Free-Atro") };

export default function FreeAtroPage() {
  /* `useSearchParams` needs a boundary: a link may name a deal (`?p=…`). */
  return (
    <Suspense>
      <FreeAtroGame deals={deals as Deal[]} />
    </Suspense>
  );
}
