"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AuthBar from "@/components/AuthBar";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import Together from "@/components/Together";
import StatShape, { Headline } from "@/components/StatShape";
import { SITE } from "@/lib/site";
import { loadGameSaves, loadResults, loadSolvedSet } from "@/lib/progress";
import { blocksSlot, codewordSlot, cryptogramSlot, jigsawSlot, slideSlot, solveforxSlot, wordgameSlot, wordtraySlot } from "@/lib/slots";
import {
  codewordRecord,
  playerRecord,
  simpleRecord,
  runRecord,
  solveRecord,
  wordRecord,
  type GameRecord,
  type PlayerRecord,
} from "@/lib/record";
import { stamps, earnedCount, nearest, share, type Stamp } from "@/lib/achievements";

import codeword from "@/data/codeword.json";
import wordgame from "@/data/wordgame.json";
import solveforx from "@/data/solveforx.json";
import slide from "@/data/slide.json";
import cryptogram from "@/data/cryptogram.json";
import blocks from "@/data/blocks.json";
import jigsaw from "@/data/jigsaw.json";
import wordtray from "@/data/wordtray.json";

/**
 * The record — design 2c.
 *
 * Reads from the saves that already exist, so it works signed out. That is not
 * incidental: this page hosts the theme panel, and gating it behind an account
 * would put picking a look behind a login, which the site does not do.
 *
 * Every time on this page is an em dash, and that is correct rather than
 * missing. Timing is opt-in and never auto-starts, so most completions have
 * none — and until the results migration lands, all of them do. The contract's
 * first rule is that a null time shows at full legibility rather than greyed
 * out, omitted, or quietly turned into a zero.
 */

type CW = { id: string; theme?: string; grid: number[][]; key: string };
type Seeded = { id: string; seed: number };
type WG = { id: string; answer: string };
type CG = { id: string; key: string };
type JS = { id: string; given: number[]; regions: number[] };
type WT = { id: string; letters: string; w: number; h: number };
type BL = {
  id: string;
  blocks: { x: number; y: number; w: number; h: number }[];
  gate: { edge: string; at: number; len: number };
};

const cwSlot = codewordSlot;
const wgSlot = wordgameSlot;
const sxSlot = solveforxSlot;
const slSlot = slideSlot;
const cgSlot = cryptogramSlot;
const jsSlot = jigsawSlot;
const wtSlot = wordtraySlot;
const blSlot = blocksSlot;

export default function Record() {
  const [games, setGames] = useState<GameRecord[] | null>(null);
  const [player, setPlayer] = useState<PlayerRecord | null>(null);
  const [badges, setBadges] = useState<Stamp[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [cw, wg, sx, sl, cg, bl, wt, js, faRuns, boRuns, wgSaves, sxSaves, results] = await Promise.all([
        loadSolvedSet("codeword"),
        loadSolvedSet("wordgame"),
        loadSolvedSet("solveforx"),
        loadSolvedSet("slide"),
        loadSolvedSet("cryptogram"),
        loadSolvedSet("blocks"),
        loadSolvedSet("wordtray"),
        loadSolvedSet("jigsaw"),
        loadGameSaves<Record<string, unknown>>("freeatro"),
        loadGameSaves<Record<string, unknown>>("blockout"),
        loadGameSaves<{ guesses?: string[] }>("wordgame"),
        loadGameSaves<{ firstScore?: number }>("solveforx"),
        loadResults(),
      ]);
      if (!alive) return;

      setGames([
        codewordRecord("01", codeword as CW[], cw, (p) => cwSlot(p as CW)),
        wordRecord("02", wgSaves, 6),
        solveRecord("03", solveforx as Seeded[], sxSaves, (p) => sxSlot(p as Seeded), 10),
        simpleRecord("slide", "04", "Sliding Tiles", slide as Seeded[], sl, (p) => slSlot(p as Seeded)),
        simpleRecord("cryptogram", "05", "Cryptogram", cryptogram as CG[], cg, (p) => cgSlot(p as CG)),
        simpleRecord("blocks", "06", "Colour Blocks", blocks as BL[], bl, (p) => blSlot(p as BL)),
        // Runs, not archives: neither of these has anything to finish.
        runRecord(
          "freeatro",
          "07",
          "Free-Atro",
          "round",
          [...faRuns.values()]
            .map((r) => ({ at: r.updatedAt, summary: (r.entries ?? {}) as Record<string, unknown> }))
            .sort((a, b) => b.at.localeCompare(a.at)),
          // Free-Atro keeps a whole Score object; the banked total is the number
          (sum) => {
            const score = sum.score as { total?: number } | undefined;
            return typeof score?.total === "number" ? score.total : null;
          },
          (sum) => {
            const moves = sum.moves;
            return typeof moves === "number" ? `${moves} moves` : null;
          }
        ),
        runRecord(
          "blockout",
          "08",
          "Block Out!",
          "run",
          [...boRuns.values()]
            .map((r) => ({ at: r.updatedAt, summary: (r.entries ?? {}) as Record<string, unknown> }))
            .sort((a, b) => b.at.localeCompare(a.at)),
          (sum) => (typeof sum.score === "number" ? sum.score : null),
          (sum) => (typeof sum.placed === "number" ? `${sum.placed} pieces` : null)
        ),
        simpleRecord("wordtray", "09", "Word Tray", wordtray as WT[], wt, (p) => wtSlot(p as WT)),
        simpleRecord("jigsaw", "10", "Jigsaw Sudoku", jigsaw as JS[], js, (p) => jsSlot(p as JS)),
      ]);

      const finished = cw.size + wg.size + sx.size + sl.size + cg.size + bl.size + wt.size + js.size;
      /* The times that were being written and never read.
         `recordResult` has stamped `elapsed_ms` on every finish since the
         results migration, and this page passed an empty array regardless — so
         it has always said every solve was untimed. Only the non-null ones go
         in: an untimed finish is not a fast one, and averaging it as zero would
         say it was. */
      const times = results.map((r) => r.elapsedMs).filter((ms): ms is number => ms !== null && ms > 0);
      setPlayer(playerRecord(finished, times));

      const solvedAll = new Set([...cw, ...wg, ...sx, ...sl, ...cg, ...bl, ...wt, ...js]);
      setBadges(
        stamps(
          [
            { id: "codeword", name: "Codeword", puzzles: codeword as CW[], slotOf: (p) => cwSlot(p as CW) },
            { id: "wordgame", name: "Word Guessing", puzzles: wordgame as WG[], slotOf: (p) => wgSlot(p as WG) },
            { id: "solveforx", name: "Solve for X", puzzles: solveforx as Seeded[], slotOf: (p) => sxSlot(p as Seeded) },
            { id: "slide", name: "Sliding Tiles", puzzles: slide as Seeded[], slotOf: (p) => slSlot(p as Seeded) },
            { id: "cryptogram", name: "Cryptogram", puzzles: cryptogram as CG[], slotOf: (p) => cgSlot(p as CG) },
            { id: "blocks", name: "Colour Blocks", puzzles: blocks as BL[], slotOf: (p) => blSlot(p as BL) },
            { id: "jigsaw", name: "Jigsaw Sudoku", puzzles: jigsaw as JS[], slotOf: (p) => jsSlot(p as JS) },
            { id: "wordtray", name: "Word Tray", puzzles: wordtray as WT[], slotOf: (p) => wtSlot(p as WT) },
          ],
          solvedAll
        )
      );
    })();
    return () => {
      alive = false;
    };
  }, []);

  const going = nearest(badges);

  return (
    <main className="shell record">
      <div className="topbar">
        <Link href="/" className="crumb">
          ← {SITE.name}
        </Link>
        <AuthBar gameId="codeword" />
      </div>

      <header className="rechead">
        <div>
          <h1 className="rectitle">The record</h1>
          <p className="recsub">What has been finished, and what is still going.</p>
        </div>
        <div className="rectotals">
          <span className="rectotal">
            <b>{player?.finished ?? "—"}</b>
            <span>finished</span>
          </span>
          <span className="rectotal">
            {/* An em dash at full legibility: there is no clock yet, and that
                is a value rather than a gap. */}
            <b className="dash">{player?.timedAverage ?? "—"}</b>
            <span>{player?.timedCount ? `avg of ${player.timedCount} timed` : "none timed"}</span>
          </span>
          <span className="rectotal">
            <b>{player?.untimedCount ?? "—"}</b>
            <span>untimed</span>
          </span>
        </div>
      </header>

      {games === null ? (
        <p className="nothingyet">Reading the record…</p>
      ) : (
        <div className="entries">
          {games.map((g) => (
            <section className={"entry" + (g.shape === "draft" ? " draft" : "")} key={g.id}>
              <div className="entryhead">
                <span className="entrynum">{g.num}</span>
                <h2 className="entryname">{g.name}</h2>
                <p className="entrynote">{g.note}</p>
              </div>
              <StatShape record={g} />
              <Headline record={g} />
            </section>
          ))}
        </div>
      )}

      <section className="stampsblock">
        <div className="stampshead">
          <h2 className="entryname">Stamps</h2>
          <span className="recsub">
            {earnedCount(badges)} of {badges.length} earned
            {going ? ` · ${going.name} is ${Math.round(share(going) * 100)}% of the way` : ""}
          </span>
        </div>
        <div className="stampgrid">
          {badges.map((s) => (
            <div className={"stamp" + (s.earned ? " earned" : "")} key={s.id}>
              <div className="stampring" aria-hidden="true">
                {s.earned ? "✦" : `${Math.round(share(s) * 100)}%`}
              </div>
              <div className="stamptext">
                {/* Unearned stamps keep their name and requirement in full —
                    hiding them is what would make this a loyalty scheme. */}
                <b>{s.name}</b>
                <span>{s.requirement}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Together />

      <section className="lookblock">
        <ThemeSwitcher alwaysOpen />
      </section>
    </main>
  );
}
