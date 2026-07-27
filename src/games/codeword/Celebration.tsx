"use client";

import { useEffect, useState } from "react";

/**
 * What a finished puzzle does.
 *
 * Themes pick their flourish: sparkles for Space and Winter, sprites flying
 * across for Stage & Screen, blossoms for everything else. The grid's own
 * accent wave runs whatever the theme, and all of it is suppressed under
 * prefers-reduced-motion, which leaves the plain "solved" banner doing the work.
 *
 * Every random choice is made once, when the burst is created, and then held in
 * state. Rolling them during render would be impure: React may re-render this
 * component for reasons of its own, and the petals would silently change colour
 * and position each time.
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

type Sprite = {
  id: number;
  size: number;
  /** percent along the grid, or vw / vh for the loose ones */
  x: number;
  y: number;
  delay: number;
  dur: number;
  swayDur: number;
  pale: boolean;
};

type Burst = { style: Style; art?: string; overGrid: Sprite[]; loose: Sprite[] };

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function buildBurst(theme?: string): Burst {
  const style: Style = (theme ? STYLE_BY_THEME[theme] : undefined) ?? "blossom";
  const art = theme ? CUSTOM_ART[theme] : undefined;
  const usable: Style = style === "custom" && !art ? "blossom" : style;

  const overGridCount = usable === "custom" ? 8 : usable === "star" ? 16 : 14;
  const looseCount = usable === "custom" ? 36 : 26;

  const overGrid: Sprite[] = Array.from({ length: overGridCount }, (_, i) => ({
    id: i,
    size: rand(26, 56),
    x: rand(2, 88),
    y: rand(2, 88),
    delay: 250 + i * 85,
    dur: 0,
    swayDur: 0,
    pale: i % 3 === 0,
  }));

  const loose: Sprite[] = Array.from({ length: looseCount }, (_, i) => ({
    id: i,
    size: usable === "custom" ? rand(54, 120) : rand(9, 20),
    x: rand(0, usable === "custom" ? 88 : 100),
    y: 0,
    delay: i * (usable === "custom" ? 110 : 170),
    dur: usable === "custom" ? rand(2.4, 5) : rand(4.6, 8),
    swayDur: rand(1.1, 3.2),
    pale: Math.random() < 0.38,
  }));

  return { style: usable, art, overGrid, loose };
}

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

function Petal({ size, fill }: { size: number; fill: string }) {
  return (
    <svg width={size} height={size * 1.4} viewBox="0 0 40 56" aria-hidden="true">
      <path d="M20 0C31 14 40 27 40 36a20 20 0 0 1-40 0C0 27 9 14 20 0Z" fill={fill} />
    </svg>
  );
}

/**
 * Mounted by the board when a puzzle is solved, and unmounts itself when the
 * burst is spent. The sprites are rolled once in a lazy initializer rather than
 * in an effect: an initializer runs exactly once for the life of the component,
 * so there is no cascading render and no chance of the petals being reshuffled
 * by an unrelated re-render.
 */
export default function Celebration({ theme, onDone }: { theme?: string; onDone: () => void }) {
  const [burst] = useState<Burst | null>(() => {
    const reduced =
      typeof window !== "undefined" &&
      (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
    return reduced ? null : buildBurst(theme);
  });

  useEffect(() => {
    const t = setTimeout(onDone, 4600); // tidy up so the grid stays legible
    return () => clearTimeout(t);
  }, [onDone]);

  if (!burst) return null;
  const { style, art, overGrid, loose } = burst;

  return (
    <>
      <div className="bloomlayer">
        {overGrid.map((s) => (
          <div
            key={s.id}
            className="blossom"
            style={{
              left: `${s.x}%`,
              top: `${s.y}%`,
              animationDelay: `${s.delay}ms, ${s.delay + 1650}ms`,
            }}
          >
            {style === "star" ? (
              <Spark size={s.size} fill={s.pale ? TINT : ACCENT} />
            ) : (
              <Blossom size={s.size} petal={s.pale ? TINT : ACCENT} />
            )}
          </div>
        ))}
      </div>

      {loose.map((s) =>
        style === "custom" && art ? (
          <div
            key={s.id}
            className="flyer"
            style={{
              top: `${s.x}vh`,
              width: s.size,
              animationDuration: `${s.dur}s`,
              animationDelay: `${s.delay}ms`,
            }}
          >
            <i style={{ animationDuration: `${s.swayDur}s` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={art} alt="" />
            </i>
          </div>
        ) : (
          <div
            key={s.id}
            className="petal"
            style={{
              left: `${s.x}vw`,
              animationDuration: `${s.dur}s`,
              animationDelay: `${s.delay}ms`,
            }}
          >
            <i style={{ animationDuration: `${s.swayDur}s` }}>
              {style === "star" ? (
                <Spark size={s.size} fill={s.pale ? TINT : ACCENT} />
              ) : (
                <Petal size={s.size} fill={s.pale ? TINT : ACCENT} />
              )}
            </i>
          </div>
        )
      )}
    </>
  );
}
