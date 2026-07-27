import WordGame from "@/games/wordgame/WordGame";
import type { Puzzle } from "@/games/wordgame/engine";
import puzzles from "@/data/wordgame.json";
import { pageTitle } from "@/lib/site";

/**
 * The archive is a static module import, as codeword's is — bundled, cached,
 * and independent of where the server process was started.
 *
 * Unlike codeword, this payload does contain its answers: colouring a guess
 * happens in the browser, so the word has to be there. They are base64 so they
 * are not readable at a glance in devtools, which is obfuscation and not
 * security — see the note in engine.ts.
 */
export const metadata = { title: pageTitle("Word guessing") };

export default function WordGamePage() {
  return <WordGame puzzles={puzzles as Puzzle[]} />;
}
