import Link from "next/link";
import AuthBar from "@/components/AuthBar";
import { SITE } from "@/lib/site";
import codeword from "@/data/codeword.json";
import wordgame from "@/data/wordgame.json";
import solveforx from "@/data/solveforx.json";
import slide from "@/data/slide.json";
import cryptogram from "@/data/cryptogram.json";

/**
 * The library. One card per game, in the order they became playable.
 *
 * The unreleased cards name what is actually planned rather than saying
 * "something else" — someone deciding whether to bookmark the site wants to
 * know what is coming, and a vague placeholder reads as abandoned.
 *
 * Counts are read from the archives rather than typed out. They were typed out
 * once and were wrong within the hour — adding a single cryptogram left the
 * card claiming 44 of 45. The archives only ever grow, so anything hand-written
 * here is a promise to remember something nobody will remember.
 */
const themeCount = new Set(
  (codeword as { theme?: string }[]).map((p) => p.theme).filter(Boolean)
).size;

type Game = {
  href?: string;
  meta: string;
  title: string;
  blurb: string;
};

const GAMES: Game[] = [
  {
    href: "/games/codeword",
    meta: `${codeword.length} puzzles · ${themeCount} themes`,
    title: "Codeword",
    blurb:
      "Every number is a letter. Crack the code from four starters and fill the grid. Each one has exactly one solution.",
  },
  // Described by its mechanic rather than named. "Wordle" is a New York Times
  // trademark and this is a public page; the real name is still to be picked.
  {
    href: "/games/wordgame",
    meta: `${wordgame.length} puzzles`,
    title: "Word Guessing",
    blurb:
      "Six guesses to find a hidden five-letter word — an archive to work through rather than one a day.",
  },
  {
    href: "/games/solveforx",
    meta: `${solveforx.length} sets`,
    title: "Solve for X",
    blurb:
      "Ten equations a set, easing from one step to two. Every answer is a whole number.",
  },
  {
    href: "/games/slide",
    meta: `${slide.length} boards`,
    title: "Sliding Tiles",
    blurb:
      "Fifteen numbers and a gap. Push them back into order — every board here can be solved.",
  },
  {
    href: "/games/cryptogram",
    meta: `${cryptogram.length} puzzles`,
    title: "Cryptogram",
    blurb:
      "A sentence hidden behind numbers — the same trick as Codeword, on a line of text instead of a grid.",
  },
];

export default function Home() {
  const [first, second] = SITE.wordmark;

  return (
    <main className="shell">
      <div className="topbar">
        <Link href="/" className="wordmark">
          {first}
          <span>{second}</span>
        </Link>
        <AuthBar />
      </div>

      <div className="hero">
        <h1>{SITE.tagline}</h1>
        <p>
          Play as much as you like without an account. Sign in only if you want your
          half-finished puzzles to follow you to another device.
        </p>
      </div>

      <div className="games">
        {GAMES.map((g) =>
          g.href ? (
            <Link key={g.title} href={g.href} className="gamecard">
              <span className="meta">{g.meta}</span>
              <h2>{g.title}</h2>
              <p>{g.blurb}</p>
            </Link>
          ) : (
            <div key={g.title} className="gamecard soon">
              <span className="meta">{g.meta}</span>
              <h2>{g.title}</h2>
              <p>{g.blurb}</p>
            </div>
          )
        )}
      </div>

      <footer className="sitefoot">
        <p>No ads, no trackers, and nothing here nagging you about a streak.</p>
      </footer>
    </main>
  );
}
