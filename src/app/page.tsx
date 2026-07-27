import Link from "next/link";
import AuthBar from "@/components/AuthBar";
import { SITE } from "@/lib/site";

/**
 * The library. One card per game, in the order they became playable.
 *
 * The unreleased cards name what is actually planned rather than saying
 * "something else" — someone deciding whether to bookmark the site wants to
 * know what is coming, and a vague placeholder reads as abandoned.
 */

type Game = {
  href?: string;
  meta: string;
  title: string;
  blurb: string;
};

const GAMES: Game[] = [
  {
    href: "/games/codeword",
    meta: "80 puzzles · 10 themes",
    title: "Codeword",
    blurb:
      "Every number is a letter. Crack the code from four starters and fill the grid. Each one has exactly one solution.",
  },
  // Described by its mechanic rather than named. "Wordle" is a New York Times
  // trademark and this is a public page; the real name is still to be picked.
  {
    meta: "Next up",
    title: "Word guessing",
    blurb:
      "Six guesses to find a hidden five-letter word — an archive to work through rather than one a day.",
  },
  {
    meta: "In the works",
    title: "Crosswords",
    blurb:
      "Themed and gentle: Pixar films, pop bands, pop culture. Written by hand, so they take longer.",
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
