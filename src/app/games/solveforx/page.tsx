import SolveGame from "@/games/solveforx/SolveGame";
import type { Puzzle } from "@/games/solveforx/engine";
import puzzles from "@/data/solveforx.json";
import { pageTitle } from "@/lib/site";

/**
 * The archive is one integer per puzzle. Both the ten equations and their
 * answers are derived from that seed in the browser, so — unlike the word game
 * — there is genuinely nothing here to leak, and two people opening the same
 * puzzle id are guaranteed the same ten problems.
 */
export const metadata = { title: pageTitle("Solve for x") };

export default function SolveForXPage() {
  return <SolveGame puzzles={puzzles as Puzzle[]} />;
}
