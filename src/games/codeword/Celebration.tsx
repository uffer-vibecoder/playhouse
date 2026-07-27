"use client";

import { useEffect, useState } from "react";

/**
 * What a finished puzzle does.
 *
 * Themes pick their flourish: sparkles for Space and Winter, sprites flying
 * across for Stage & Screen, blossoms for everything else. The grid's own
 * accent wave runs whatever the theme, and all of it is suppressed under
 * prefers-reduced-motion, which leaves the plain "solved" banner doing the work.
 */

const ACCENT = "#F5A9C6";
const TINT = "#FDEFF4";
const DEEP = "#C4467E";

type Style = "blossom" | "star" | "custom";

const STYLE_BY_THEME: Record<string, Style> = {
  Space: "star",
  Winter: "star",
  "Stage & Screen": "custom",
};

const CUSTOM_ART: Record<string, string> = {
  "Stage & Screen": "/stage-screen.png",
};

function Blossom({ size, petal }: { size: number; petal: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <ellipse key={i} cx="50" cy="28" rx="14" ry="21" fill={petal} transform={`rotate(${i * 72} 50 50)`} />
      ))}
      <circle cx="50" cy="50" r="9.5" fill={DEEP} />
    </svg>
  );
}

function Spark({ size, fill }: { size: number; fill: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <path d="M50 2C56 38 62 44 98 50C62 56 56 62 50 98C44 62 38 56 2 50C38 44 44 38 50 2Z" fill={fill} />
    </svg>
  );
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export default function Celebration({ active, theme }: { active: boolean; theme?: string }) {
  const [on, setOn] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  }, []);

  useEffect(() => {
    if (!active) return;
    setOn(true);
    const t = setTimeout(() => setOn(false), 4600); // tidy up so the grid stays legible
    return () => clearTimeout(t);
  }, [active]);

  if (!on || reduced) return null;

  const style: Style = (theme ? STYLE_BY_THEME[theme] : undefined) ?? "blossom";
  const art = theme ? CUSTOM_ART[theme] : undefined;

  // scattered over the grid
  const overGrid = Array.from({ length: style === "custom" ? 8 : style === "star" ? 16 : 14 }, (_, i) => ({
    i,
    size: rand(26, 56),
    left: rand(2, 88),
    top: rand(2, 88),
    delay: 250 + i * 85,
  }));

  // shed down the page, or flown across it
  const loose = Array.from({ length: style === "custom" ? 36 : 26 }, (_, i) => ({
    i,
    size: style === "custom" ? rand(54, 120) : rand(9, 20),
    pos: rand(0, style === "custom" ? 88 : 100),
    dur: style === "custom" ? rand(2.4, 5) : rand(4.6, 8),
    swayDur: rand(1.1, 3.2),
    delay: i * (style === "custom" ? 110 : 170),
  }));

  return (
    <>
      <div className="bloomlayer">
        {overGrid.map((b) => (
          <div
            key={b.i}
            className="blossom"
            style={{
              left: `${b.left}%`,
              top: `${b.top}%`,
              animationDelay: `${b.delay}ms, ${b.delay + 1650}ms`,
            }}
          >
            {style === "star" ? (
              <Spark size={b.size} fill={b.i % 3 === 0 ? TINT : ACCENT} />
            ) : (
              <Blossom size={b.size} petal={b.i % 3 === 0 ? TINT : ACCENT} />
            )}
          </div>
        ))}
      </div>

      {loose.map((p) =>
        style === "custom" && art ? (
          <div
            key={p.i}
            className="flyer"
            style={{ top: `${p.pos}vh`, width: p.size, animationDuration: `${p.dur}s`, animationDelay: `${p.delay}ms` }}
          >
            <i style={{ animationDuration: `${p.swayDur}s` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={art} alt="" />
            </i>
          </div>
        ) : (
          <div
            key={p.i}
            className="petal"
            style={{ left: `${p.pos}vw`, animationDuration: `${p.dur}s`, animationDelay: `${p.delay}ms` }}
          >
            <i style={{ animationDuration: `${p.swayDur}s` }}>
              {style === "star" ? (
                <Spark size={p.size} fill={Math.random() < 0.4 ? TINT : ACCENT} />
              ) : (
                <svg width={p.size} height={p.size * 1.4} viewBox="0 0 40 56" aria-hidden="true">
                  <path
                    d="M20 0C31 14 40 27 40 36a20 20 0 0 1-40 0C0 27 9 14 20 0Z"
                    fill={Math.random() < 0.35 ? TINT : ACCENT}
                  />
                </svg>
              )}
            </i>
          </div>
        )
      )}
    </>
  );
}
