"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Mark from "@/components/Mark";
import {
  STEPS,
  TOWERS,
  runNight,
  waveFor,
  type Field,
  type NightResult,
  type Tower,
  type TowerKind,
} from "./engine";

/**
 * Stage one: place, watch, see how it went.
 *
 * There is no economy here yet and towers cost nothing. The only question this
 * is built to answer is whether a computed night *reads* — whether watching it
 * is worth doing, and whether choosing where to stand things is a decision or
 * a formality. If it is not, nothing has been spent on crops.
 *
 * The replay is already decided before a frame is drawn, so playback is pure
 * presentation: the speed control, the pause, and skipping to the end cannot
 * change what happened. That is also the answer for reduced motion — the whole
 * thing is skippable and the outcome is written out in words either way.
 */

/** A path that doubles back, so a tower in the middle can watch two stretches
 *  of it — which is the only reason placement is interesting. */
const W = 8;
const H = 6;
const PATH = [
  0, 1, 2, 3, 4, 5, 6, 7,
  15, 23,
  22, 21, 20, 19, 18, 17, 16,
  24, 32,
  33, 34, 35, 36, 37, 38, 39,
  47,
];

const onPath = new Set(PATH);
const KINDS: TowerKind[] = ["scarecrow", "beehive", "sprinkler"];

/** Where a pest stands, in cell units, interpolating between path cells. */
function posOf(at: number): { x: number; y: number } {
  const i = Math.min(Math.floor(at / STEPS), PATH.length - 1);
  const f = (at % STEPS) / STEPS;
  const a = PATH[i];
  const b = PATH[Math.min(i + 1, PATH.length - 1)];
  const ax = a % W, ay = Math.floor(a / W);
  const bx = b % W, by = Math.floor(b / W);
  return { x: ax + (bx - ax) * f, y: ay + (by - ay) * f };
}

const pct = (n: number, of: number) => `${(n / of) * 100}%`;

export default function FarmBoard() {
  const [towers, setTowers] = useState<Tower[]>([]);
  const [holding, setHolding] = useState<TowerKind>("scarecrow");
  const [night, setNight] = useState(1);

  /** the computed night, and where the playback has got to */
  const [result, setResult] = useState<NightResult | null>(null);
  const [frame, setFrame] = useState(0);
  const [speed, setSpeed] = useState(2);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const field: Field = useMemo(() => ({ w: W, h: H, path: PATH, towers }), [towers]);
  const wave = useMemo(() => waveFor(night, 1), [night]);

  const nightfall = useCallback(() => {
    const r = runNight(field, wave);
    setResult(r);
    setFrame(0);
    setPlaying(true);
  }, [field, wave]);

  /* Playback. The one loop in the game, and it decides nothing — dropping a
     frame or backgrounding the tab cannot change the outcome. */
  useEffect(() => {
    if (!playing || !result) return;
    timer.current = setInterval(() => {
      setFrame((f) => {
        if (f + 1 >= result.frames.length) {
          setPlaying(false);
          return result.frames.length - 1;
        }
        return f + 1;
      });
    }, Math.max(16, 90 / speed));
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing, result, speed]);

  const place = (cell: number) => {
    if (onPath.has(cell) || result) return;
    setTowers((ts) =>
      ts.some((t) => t.at === cell)
        ? ts.filter((t) => t.at !== cell) // tap again to take it away
        : [...ts, { at: cell, kind: holding }]
    );
  };

  const reset = () => {
    setResult(null);
    setFrame(0);
    setPlaying(false);
  };

  const now = result?.frames[frame];
  const shown = now?.motes ?? [];
  const done = result !== null && frame >= result.frames.length - 1 && !playing;

  /**
   * What has happened up to the frame on screen.
   *
   * Counted from the replay rather than read off the result, because the
   * result is the *end* of the night and showing it early would give the
   * ending away on the first frame. A pest is gone by frame f if it was on
   * the field earlier and is not now; it leaked if it had got near the house.
   */
  const soFar = useMemo(() => {
    if (!result) return { killed: 0, leaked: 0 };
    const seen = new Map<number, number>(); // id → furthest step seen
    for (let i = 0; i <= frame && i < result.frames.length; i++) {
      for (const m of result.frames[i].motes) seen.set(m.id, m.at);
    }
    const here = new Set((result.frames[frame]?.motes ?? []).map((m) => m.id));
    let killed = 0, leaked = 0;
    const end = PATH.length * STEPS;
    for (const [id, at] of seen) {
      if (here.has(id)) continue;
      // it left the field: near the end means it got in, otherwise it died
      if (at >= end - 12) leaked++;
      else killed++;
    }
    return { killed, leaked };
  }, [result, frame]);

  return (
    <div className="sheet">
      <header>
        <div>
          <h1>Smallholding</h1>
          <div className="titlerow">
            <span className="strapline">A farm by day, a siege by night</span>
            <span className="pill-num">NIGHT {night}</span>
          </div>
        </div>
        <div className="badges">
          <Mark size={44} />
        </div>
      </header>

      <details className="disclosure noprint">
        <summary>
          <span className="chev" />
          What this is
        </summary>
        <div className="disclosure-body">
          <p className="intro">
            An early look at the night half. Stand things on the ground — they cost nothing yet —
            then send the night in and watch what happens. Tap a tower again to take it away.
          </p>
          <p className="intro">
            The night is worked out in full the moment you send it, so the speed control and the
            skip cannot change the result: they only decide how fast you find out. That is the
            whole design. The farm, the money and the crops come next, and only if watching this
            turns out to be worth doing.
          </p>
        </div>
      </details>

      <div className="fm-pick noprint">
        {KINDS.map((k) => (
          <button
            key={k}
            className={"fm-kind" + (holding === k ? " on" : "")}
            onClick={() => setHolding(k)}
            aria-pressed={holding === k}
            disabled={result !== null}
          >
            <span className={"fm-glyph " + k} aria-hidden="true" />
            {TOWERS[k].name}
          </button>
        ))}
      </div>

      <div
        className="fm-field"
        style={{ aspectRatio: `${W} / ${H}` }}
        role="group"
        aria-label={`${W} by ${H} field`}
      >
        <div
          className="fm-cells"
          aria-hidden="true"
          style={{ gridTemplateColumns: `repeat(${W}, 1fr)`, gridTemplateRows: `repeat(${H}, 1fr)` }}
        >
          {Array.from({ length: W * H }, (_, c) => (
            <span key={c} className={"fm-cell" + (onPath.has(c) ? " track" : "")} />
          ))}
        </div>

        {/* the gate and the house, so the direction of travel is obvious */}
        <span className="fm-end gate" style={{ left: pct(PATH[0] % W, W), top: pct(Math.floor(PATH[0] / W), H), width: pct(1, W), height: pct(1, H) }}>in</span>
        <span className="fm-end house" style={{ left: pct(PATH[PATH.length - 1] % W, W), top: pct(Math.floor(PATH[PATH.length - 1] / W), H), width: pct(1, W), height: pct(1, H) }}>home</span>

        {/* the towers */}
        {towers.map((t) => (
          <button
            key={t.at}
            className={"fm-tower " + t.kind}
            style={{ left: pct(t.at % W, W), top: pct(Math.floor(t.at / W), H), width: pct(1, W), height: pct(1, H) }}
            onClick={() => place(t.at)}
            disabled={result !== null}
            aria-label={`${TOWERS[t.kind].name}, row ${Math.floor(t.at / W) + 1} column ${(t.at % W) + 1}`}
          >
            <span className={"fm-glyph " + t.kind} aria-hidden="true" />
          </button>
        ))}

        {/* free ground, tappable while the sun is up */}
        {!result &&
          Array.from({ length: W * H }, (_, c) =>
            onPath.has(c) || towers.some((t) => t.at === c) ? null : (
              <button
                key={c}
                className="fm-plot"
                style={{ left: pct(c % W, W), top: pct(Math.floor(c / W), H), width: pct(1, W), height: pct(1, H) }}
                onClick={() => place(c)}
                aria-label={`empty ground, row ${Math.floor(c / W) + 1} column ${(c % W) + 1}`}
              />
            )
          )}

        {/* the pests, wherever the current frame says they are */}
        {shown.map((m) => {
          const p = posOf(m.at);
          return (
            <span
              key={m.id}
              className={"fm-pest " + m.kind + (m.slowed ? " slowed" : "")}
              style={{ left: pct(p.x, W), top: pct(p.y, H), width: pct(1, W), height: pct(1, H) }}
              aria-hidden="true"
            />
          );
        })}

        {/* what fired this tick */}
        {now?.shots.map((s, i) => {
          const target = shown.find((m) => m.id === s.to);
          if (!target) return null;
          const a = { x: (s.from % W) + 0.5, y: Math.floor(s.from / W) + 0.5 };
          const b = posOf(target.at);
          return (
            <svg key={i} className="fm-shot" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
              <line x1={a.x} y1={a.y} x2={b.x + 0.5} y2={b.y + 0.5} />
            </svg>
          );
        })}
      </div>

      {result ? (
        <div className="fm-tools noprint">
          <button className="tool" onClick={() => setPlaying((p) => !p)} disabled={done}>
            {playing ? "Pause" : "Play"}
          </button>
          <button
            className="tool"
            onClick={() => setSpeed((s) => (s >= 8 ? 1 : s * 2))}
            disabled={done}
          >
            {speed}× speed
          </button>
          <button
            className="tool"
            onClick={() => { setPlaying(false); setFrame(result.frames.length - 1); }}
            disabled={done}
          >
            Skip
          </button>
        </div>
      ) : (
        <div className="fm-tools noprint">
          <button className="tool" onClick={nightfall} disabled={towers.length === 0}>
            Send in the night
          </button>
          <button className="tool" onClick={() => setTowers([])} disabled={!towers.length}>
            Clear the field
          </button>
        </div>
      )}

      <div className="status">
        <span>
          {result
            ? `Tick ${now?.tick ?? 0} of ${result.frames.length - 1} · ${shown.length} still coming`
            : `${towers.length} standing · night ${night} sends ${wave.length}`}
        </span>
        {/* The outcome is known the moment the night is sent, but saying so
            while it plays would give the ending away on the first frame — which
            is the one thing that would make watching pointless. Until the
            replay is done, this counts what has happened *so far*. */}
        <span>
          {!result
            ? "tap the ground"
            : done
              ? `${result.killed} stopped, ${result.leaked} got through`
              : `${soFar.killed} stopped, ${soFar.leaked} got through`}
        </span>
      </div>

      {done && result && (
        <div className="win show">
          {result.held
            ? `Nothing got through. ${result.killed} stopped.`
            : `${result.leaked} got through. ${result.killed} stopped.`}
        </div>
      )}

      {done && (
        <div className="fm-tools noprint">
          <button className="tool" onClick={() => { reset(); setNight((n) => n + 1); }}>
            On to night {night + 1}
          </button>
          <button className="tool" onClick={reset}>
            Same night again
          </button>
          <button
            className="tool"
            onClick={() => { reset(); setNight(1); setTowers([]); }}
          >
            Start over
          </button>
        </div>
      )}

      <footer>
        <span>Smallholding · the night is decided before you watch it</span>
        <span>an early look — nothing is saved yet</span>
      </footer>
    </div>
  );
}
