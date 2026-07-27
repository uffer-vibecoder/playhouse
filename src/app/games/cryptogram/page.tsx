import { Suspense } from "react";
import CryptoGame from "@/games/cryptogram/CryptoGame";
import type { Puzzle } from "@/games/cryptogram/engine";
import puzzles from "@/data/cryptogram.json";
import { pageTitle } from "@/lib/site";

/**
 * Each puzzle carries its sentence and the cipher behind it. Both have to be
 * here — the board shows the numbers and has to know which letter each stands
 * for — so this is the same trade the word game makes, and base64 on the text
 * is obfuscation rather than security.
 *
 * What is genuinely guaranteed is upstream: scripts/build-cryptogram.mjs proves
 * every sentence has exactly one reading before it ships.
 */
export const metadata = { title: pageTitle("Cryptogram") };

export default function CryptogramPage() {
  /* `useSearchParams` needs a boundary: a link may name a puzzle
   (`?p=…`), and reading the query is what stops this page prerendering. */
  return (
    <Suspense>
      <CryptoGame puzzles={puzzles as Puzzle[]} />
    </Suspense>
  );
}
