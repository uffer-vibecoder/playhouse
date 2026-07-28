import BlockGame from "@/games/blockout/BlockGame";
import { pageTitle } from "@/lib/site";

/**
 * The one game here that is not a puzzle: endless, score-driven, and finished
 * only when you are stuck. Built as the game rather than reshaped into
 * something it is not — see the note at the top of its engine.
 */
export const metadata = { title: pageTitle("Block Out!") };

export default function BlockOutPage() {
  return <BlockGame />;
}
