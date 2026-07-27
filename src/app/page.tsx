import Link from "next/link";
import AuthBar from "@/components/AuthBar";

export default function Home() {
  return (
    <main className="shell">
      <div className="topbar">
        <Link href="/" className="wordmark">
          Play<span>house</span>
        </Link>
        <AuthBar />
      </div>

      <div className="hero">
        <h1>Puzzles, on the house.</h1>
        <p>
          Play as much as you like without an account. Sign in only if you want your
          half-finished puzzles to follow you to another device.
        </p>
      </div>

      <div className="games">
        <Link href="/games/codeword" className="gamecard">
          <span className="meta">80 puzzles · 10 themes</span>
          <h2>Codeword</h2>
          <p>
            Every number is a letter. Crack the code from four starters and fill the grid.
            Each one has exactly one solution.
          </p>
        </Link>

        <div className="gamecard soon">
          <span className="meta">Coming soon</span>
          <h2>Something else</h2>
          <p>There is room here for the next one — the shell, saves and sign-in are shared.</p>
        </div>
      </div>
    </main>
  );
}
