"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AuthBar from "@/components/AuthBar";
import Mark from "@/components/Mark";
import { SITE } from "@/lib/site";
import { fingerprint, lastUnfinished, loadSolvedSet, slotKey, type Bookmark } from "@/lib/progress";
import { stamps, earnedCount, nearest, share, type Stamp } from "@/lib/achievements";

import codeword from "@/data/codeword.json";
import wordgame from "@/data/wordgame.json";
import solveforx from "@/data/solveforx.json";
import slide from "@/data/slide.json";
import cryptogram from "@/data/cryptogram.json";
import blocks from "@/data/blocks.json";

/**
 * The contents page — design 6a, and 6b on a phone.
 *
 * A volume's contents rather than a menu: a spine down the left, entries
 * numbered in the order they were added, and a rail on the right for where you
 * left off and what you have earned.
 *
 * **The index never reorders and new games append to the bottom.** That is
 * design's rule and it is the reason our five run 01–05 where the mock shows
 * three — an entry's number is part of how you find it again, so sorting by
 * recency or progress would move the furniture around under someone.
 *
 * The scrap-paper teaser from 6a is deliberately not here yet: it is the
 * largest piece of the page and a shop window for a game that is one click
 * away.
 */

type CW = { id: string; theme?: string; grid: number[][]; key: string };
type Seeded = { id: string; seed: number };
type WG = { id: string; answer: string };
type CG = { id: string; key: string };
type BL = { id: string; blocks: { x: number; y: number; w: number; h: number }[]; gates: { edge: string; at: number; len: number; hue: string }[] };

const cwSlot = (p: CW) => slotKey("codeword", p.id, fingerprint(p.grid, p.key));
const wgSlot = (p: WG) => slotKey("wordgame", p.id, fingerprint([[5, 6]], p.answer));
const sxSlot = (p: Seeded) => slotKey("solveforx", p.id, fingerprint([[p.seed]], String(p.seed)));
const slSlot = (p: Seeded) => slotKey("slide", p.id, fingerprint([[p.seed]], String(p.seed)));
const cgSlot = (p: CG) => slotKey("cryptogram", p.id, fingerprint([[p.key.length]], p.key));
const blSlot = (p: BL) =>
  slotKey(
    "blocks",
    p.id,
    fingerprint(
      p.blocks.map((b) => [b.x, b.y, b.w, b.h]),
      p.gates.map((g) => `${g.edge}${g.at}${g.len}${g.hue}`).join("|")
    )
  );

type Entry = {
  num: string;
  name: string;
  href?: string;
  count: string;
  blurb: string;
  total: number;
  done: number;
};

const ROUTE: Record<string, string> = {
  codeword: "/games/codeword",
  wordgame: "/games/wordgame",
  solveforx: "/games/solveforx",
  slide: "/games/slide",
  cryptogram: "/games/cryptogram",
  blocks: "/games/blocks",
};

const LABEL: Record<string, string> = {
  codeword: "Codeword",
  wordgame: "Word Guessing",
  solveforx: "Solve for X",
  slide: "Sliding Tiles",
  cryptogram: "Cryptogram",
  blocks: "Colour Blocks",
};

/**
 * Twelve pips at most: the point is a sense of how far along, not a census of
 * a 120-puzzle archive.
 *
 * Any progress at all lights a pip. Rounding is what feels natural, but one
 * finished out of 120 rounds to nothing — so the row would read "1 finished"
 * beside twelve empty pips and look broken.
 */
function Pips({ done, total }: { done: number; total: number }) {
  const shown = Math.min(12, total);
  const lit = done === 0 ? 0 : Math.max(1, Math.round((done / total) * shown));
  return (
    <span className="tocpips">
      {Array.from({ length: shown }, (_, i) => (
        <span key={i} className={"pip" + (i < lit ? " on" : "")} />
      ))}
      <span className="tocdone">{done} finished</span>
    </span>
  );
}

export default function Contents() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [mark, setMark] = useState<Bookmark | null>(null);
  const [badges, setBadges] = useState<Stamp[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [cw, wg, sx, sl, cg, bl] = await Promise.all([
        loadSolvedSet("codeword"),
        loadSolvedSet("wordgame"),
        loadSolvedSet("solveforx"),
        loadSolvedSet("slide"),
        loadSolvedSet("cryptogram"),
        loadSolvedSet("blocks"),
      ]);
      if (!alive) return;

      const count = <T,>(list: T[], solved: Set<string>, slotOf: (p: T) => string) =>
        list.filter((p) => solved.has(slotOf(p))).length;

      setEntries([
        {
          num: "01", name: "Codeword", href: ROUTE.codeword,
          count: `${codeword.length} puzzles`,
          blurb: "Numbers for letters, thirteen squares square. Every letter turns up somewhere.",
          total: codeword.length, done: count(codeword as CW[], cw, cwSlot),
        },
        {
          num: "02", name: "Word Guessing", href: ROUTE.wordgame,
          count: `${wordgame.length} puzzles`,
          blurb: "Five letters, six tries. States read by fill and weight, so they hold up without colour.",
          total: wordgame.length, done: count(wordgame as WG[], wg, wgSlot),
        },
        {
          num: "03", name: "Solve for X", href: ROUTE.solveforx,
          count: `${solveforx.length} sets`,
          blurb: "Ten equations to a set, worked down a ruled page like homework you chose.",
          total: solveforx.length, done: count(solveforx as Seeded[], sx, sxSlot),
        },
        {
          num: "04", name: "Sliding Tiles", href: ROUTE.slide,
          count: `${slide.length} boards`,
          blurb: "Fifteen numbers and a gap. Every board here can be solved — that is checked before it ships.",
          total: slide.length, done: count(slide as Seeded[], sl, slSlot),
        },
        {
          num: "05", name: "Cryptogram", href: ROUTE.cryptogram,
          count: `${cryptogram.length} puzzles`,
          blurb: "A sentence behind numbers. Each one has exactly one reading, proved before it ships.",
          total: cryptogram.length, done: count(cryptogram as CG[], cg, cgSlot),
        },
        {
          num: "06", name: "Colour Blocks", href: ROUTE.blocks,
          count: `${blocks.length} boards`,
          blurb: "Slide the blocks out through gates that match them. Every board's shortest route is known.",
          total: blocks.length, done: count(blocks as BL[], bl, blSlot),
        },
        // The drafts take the next numbers rather than keeping theirs. The rule
        // is that a shipped entry never moves — nobody has navigated to a draft,
        // so nothing is being pulled out from under anyone.
        { num: "07", name: "Word Tray", count: "in draft", blurb: "the letters are the clue", total: 0, done: 0 },
        { num: "08", name: "Jigsaw Sudoku", count: "in draft", blurb: "the regions are the hard part", total: 0, done: 0 },
      ]);

      setMark(lastUnfinished());
      setBadges(
        stamps(
          [
            { id: "codeword", name: "Codeword", puzzles: codeword as CW[], slotOf: (p) => cwSlot(p as CW) },
            { id: "wordgame", name: "Word Guessing", puzzles: wordgame as WG[], slotOf: (p) => wgSlot(p as WG) },
            { id: "solveforx", name: "Solve for X", puzzles: solveforx as Seeded[], slotOf: (p) => sxSlot(p as Seeded) },
            { id: "slide", name: "Sliding Tiles", puzzles: slide as Seeded[], slotOf: (p) => slSlot(p as Seeded) },
            { id: "cryptogram", name: "Cryptogram", puzzles: cryptogram as CG[], slotOf: (p) => cgSlot(p as CG) },
            { id: "blocks", name: "Colour Blocks", puzzles: blocks as BL[], slotOf: (p) => blSlot(p as BL) },
          ],
          new Set([...cw, ...wg, ...sx, ...sl, ...cg, ...bl])
        )
      );
    })();
    return () => { alive = false; };
  }, []);

  const total =
    codeword.length + wordgame.length + solveforx.length + slide.length + cryptogram.length + blocks.length;
  const carryOn = mark ? `${ROUTE[mark.gameId] ?? "/"}?p=${encodeURIComponent(mark.puzzleId)}` : null;
  const going = nearest(badges);
  const here = mark ? entries?.find((e) => e.href === ROUTE[mark.gameId]) : null;
  const [first, second] = SITE.wordmark;

  return (
    <div className="page">
      <div className="spine" aria-hidden="true">
        <span className="hole" /><span className="hole" /><span className="hole" />
        <span className="volume">volume one</span>
      </div>

      <main className="sheetless">
        <div className="topbar">
          <span className="wordmark">
            <Mark size={40} />
            <span className="wordtext">
              {first}
              <span>{second}</span>
            </span>
          </span>
          <Link href="/record" className="crumb">The record</Link>
          <AuthBar gameId="codeword" />
        </div>

        <p className="strap">{SITE.tagline} Nothing expires, no streak to keep, no clock unless you ask for one.</p>

        {carryOn && mark && (
          <Link href={carryOn} className="carry">
            <span className="carrylabel">Start back on your last puzzle →</span>
            <span className="carrywhat">
              {LABEL[mark.gameId] ?? mark.gameId} {mark.puzzleId.replace(/^[A-Z]+-/, "No. ")}
            </span>
          </Link>
        )}

        <div className="cols">
          <section className="contents">
            <div className="colhead">
              <span>Contents</span>
              <span>{total} puzzles · pick anything, any time</span>
            </div>

            {entries === null ? (
              <p className="nothingyet">Opening the book…</p>
            ) : (
              entries.map((e) =>
                e.href ? (
                  <Link href={e.href} className="tocentry" key={e.num}>
                    <span className="tocnum">{e.num}</span>
                    <span className="tocbody">
                      <span className="tocname">{e.name}</span>
                      <span className="tocblurb">{e.blurb}</span>
                      <Pips done={e.done} total={e.total} />
                    </span>
                    <span className="toccol">
                      <span className="toccount">{e.count}</span>
                      <span className="tocopen">Open →</span>
                    </span>
                  </Link>
                ) : (
                  <div className="tocentry draft" key={e.num}>
                    <span className="tocnum">{e.num}</span>
                    <span className="tocbody">
                      <span className="tocname">{e.name}</span>
                      <span className="tocblurb">{e.blurb}</span>
                    </span>
                    <span className="toccount">{e.count}</span>
                  </div>
                )
              )
            )}
            <p className="tocnote">↳ new games are added to the bottom; the index never reorders itself</p>
          </section>

          <aside className="rail">
            <div className="railhead">Bookmark</div>
            {mark ? (
              <>
                <div className="railtitle">
                  {LABEL[mark.gameId] ?? mark.gameId} {mark.puzzleId.replace(/^[A-Z]+-/, "No. ")}
                </div>
                <p className="railnote">Started, not finished.</p>
                {/* deliberately no second "Carry on" — the strip above the
                    contents is that action, and two links to one puzzle in one
                    view is a stutter. This card is the detail. */}
                {here && <Pips done={here.done} total={here.total} />}
                {/* no clock exists yet, and saying so beats implying one */}
                <span className="raildash">— no time recorded</span>
              </>
            ) : (
              <p className="railnote">Nothing half-finished. Start anywhere.</p>
            )}

            <div className="railhead stampstop">Stamps</div>
            <p className="railnote">
              {earnedCount(badges)} of {badges.length} earned
              {going ? ` · closest is ${going.name}` : ""}
            </p>
            <div className="railstamps">
              {badges.filter((s) => s.earned).slice(0, 4).map((s) => (
                <span className="railstamp" key={s.id} title={s.name}>{s.name.slice(0, 8)}</span>
              ))}
              {going && (
                <span className="railstamp dial" title={going.requirement}>
                  {Math.round(share(going) * 100)}%
                </span>
              )}
            </div>
            <Link href="/record" className="crumb">See all →</Link>
          </aside>
        </div>

        <footer className="sitefoot">
          <p>No ads, no trackers, and nothing here nagging you about a streak.</p>
        </footer>
      </main>
    </div>
  );
}
