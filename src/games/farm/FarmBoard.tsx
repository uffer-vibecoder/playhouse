"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Mark from "@/components/Mark";
import {
  PESTS,
  STEPS,
  STIPEND,
  TOWERS,
  build,
  newRun,
  nightsSurvived,
  runNight,
  sell,
  sellValue,
  settle,
  statsOf,
  upgrade,
  upgradeCost,
  waveFor,
  type Field,
  type NightResult,
  type Run,
  type TowerKind,
} from "./engine";

/**
 * Stage two: the day is a decision, and the night shows its working.
 *
 * The first cut had towers free and unlimited, and the verdict was that it was
 * not very interactive. That was right, and not because it needed more buttons:
 * with nothing to spend there was nothing to weigh up, so placing a tower was
 * not a choice at all. Money, levels and lives are what turn the field into a
 * question.
 *
 * The replay is still decided before it is drawn — speed, pause and skip only
 * change how fast you find out — but it now shows enough to be worth watching:
 * what is hurt, what dies, what gets through, and how close a pest is to
 * either.
 */

const W = 8;
const H = 6;
/** A path that doubles back, so one good spot can watch two stretches of it. */
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
  const [run, setRun] = useState<Run>(newRun);
  const [holding, setHolding] = useState<TowerKind>("scarecrow");
  /** the tower being looked at, which is where upgrading and selling happen */
  const [picked, setPicked] = useState<number | null>(null);

  const [result, setResult] = useState<NightResult | null>(null);
  const [frame, setFrame] = useState(0);
  const [speed, setSpeed] = useState(2);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const field: Field = useMemo(
    () => ({ w: W, h: H, path: PATH, towers: run.towers }),
    [run.towers]
  );
  const wave = useMemo(() => waveFor(run.night, 1), [run.night]);

  const nightfall = useCallback(() => {
    setResult(runNight(field, wave));
    setFrame(0);
    setPicked(null);
    setPlaying(true);
  }, [field, wave]);

  /* Playback. The only loop, and it decides nothing. */
  useEffect(() => {
    if (!playing || !result) return;
    timer.current = setInterval(() => {
      setFrame((f) => {
        if (f + 1 >= result.frames.length) { setPlaying(false); return result.frames.length - 1; }
        return f + 1;
      });
    }, Math.max(16, 110 / speed));
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing, result, speed]);

  const now = result?.frames[frame];

  /**
   * The house flinches for a few frames after something gets in.
   *
   * Derived from how recently a leak happened rather than held in state and
   * cleared by a timer: setting state from inside an effect to drive an
   * animation is how cascading renders start, and the lint here rightly
   * refuses it. This is a pure function of the frame on screen.
   */
  const flash = useMemo(() => {
    if (!result) return false;
    for (let i = frame; i >= 0 && i > frame - 6; i--) {
      if (result.frames[i]?.leaked.length) return true;
    }
    return false;
  }, [result, frame]);

  /**
   * What has happened up to the frame on screen.
   *
   * Summed from what each frame reports rather than guessed from pests going
   * missing — the first version worked it out by how far along a vanished pest
   * had been, which is a guess in the one place the replay has to agree with
   * the result exactly.
   */
  const soFar = useMemo(() => {
    if (!result) return { killed: 0, leaked: 0 };
    let killed = 0, leaked = 0;
    for (let i = 0; i <= frame && i < result.frames.length; i++) {
      killed += result.frames[i].died.length;
      leaked += result.frames[i].leaked.length;
    }
    return { killed, leaked };
  }, [result, frame]);

  const done = result !== null && frame >= result.frames.length - 1 && !playing;
  const lost = done && result !== null && run.lives - result.leaked <= 0;

  const carryOn = () => {
    if (!result) return;
    setRun((r) => settle(r, result));
    setResult(null);
    setFrame(0);
  };

  const startOver = () => {
    setRun(newRun());
    setResult(null);
    setFrame(0);
    setPicked(null);
  };

  const tap = (cell: number) => {
    if (result) return;
    if (run.towers.some((t) => t.at === cell)) { setPicked(picked === cell ? null : cell); return; }
    setPicked(null);
    setRun((r) => build(r, cell, holding, PATH));
  };

  const chosen = picked === null ? null : run.towers.find((t) => t.at === picked) ?? null;
  const shown = now?.motes ?? [];
  /** ids hit on this tick, so a hit reads as a hit */
  const struck = new Set(now?.shots.map((s) => s.to) ?? []);

  return (
    <div className="sheet">
      <header>
        <div>
          <h1>Smallholding</h1>
          <div className="titlerow">
            <span className="strapline">A farm by day, a siege by night</span>
            <span className="pill-num">NIGHT {run.night}</span>
          </div>
        </div>
        <div className="badges">
          <Mark size={44} />
        </div>
      </header>

      <details className="disclosure noprint">
        <summary>
          <span className="chev" />
          How to play
        </summary>
        <div className="disclosure-body">
          <p className="intro">
            Pests come through the gate each night and walk to your house. Stand things in their
            way. Tap bare ground to build, tap what you built to <b>upgrade</b> it or <b>sell</b> it
            back for half. Everything costs money, and money is the whole game.
          </p>
          <p className="intro">
            A scarecrow is steady, a beehive hits hard and slowly, a sprinkler barely hurts anything
            but holds pests still in front of the other two. The path doubles back, so one good spot
            can cover two stretches of it.
          </p>
          <p className="intro">
            When you send the night in it is worked out in full at once, so pause, speed and skip
            only change how fast you find out — never what happens. Each pest that reaches the house
            costs a life, and the run ends at none.
          </p>
        </div>
      </details>

      <div className="fm-purse">
        <span className="fm-coins">{run.coins}<i>coins</i></span>
        <span className="fm-lives" aria-label={`${run.lives} lives left`}>
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} className={"fm-heart" + (i < run.lives ? " on" : "")} aria-hidden="true" />
          ))}
        </span>
        <span className="fm-sent">night {run.night} sends {wave.length}</span>
      </div>

      {!result && !run.over && (
        <div className="fm-pick noprint">
          {KINDS.map((k) => (
            <button
              key={k}
              className={"fm-kind" + (holding === k ? " on" : "")}
              onClick={() => { setHolding(k); setPicked(null); }}
              aria-pressed={holding === k}
              disabled={run.coins < TOWERS[k].cost}
            >
              <span className={"fm-glyph " + k} aria-hidden="true" />
              {TOWERS[k].name}
              <b>{TOWERS[k].cost}</b>
            </button>
          ))}
        </div>
      )}

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

        <span className="fm-end gate"
          style={{ left: pct(PATH[0] % W, W), top: pct(Math.floor(PATH[0] / W), H), width: pct(1, W), height: pct(1, H) }}>in</span>
        <span className={"fm-end house" + (flash ? " struck" : "")}
          style={{ left: pct(PATH[PATH.length - 1] % W, W), top: pct(Math.floor(PATH[PATH.length - 1] / W), H), width: pct(1, W), height: pct(1, H) }}>home</span>

        {/* what the tower you tapped can actually see */}
        {chosen && !result && (
          <span
            className="fm-reach"
            aria-hidden="true"
            style={{
              left: pct((chosen.at % W) - statsOf(chosen).range, W),
              top: pct(Math.floor(chosen.at / W) - statsOf(chosen).range, H),
              width: pct(statsOf(chosen).range * 2 + 1, W),
              height: pct(statsOf(chosen).range * 2 + 1, H),
            }}
          />
        )}

        {run.towers.map((t) => (
          <button
            key={t.at}
            className={
              "fm-tower " + t.kind +
              (picked === t.at ? " on" : "") +
              (now?.shots.some((s) => s.from === t.at) ? " firing" : "")
            }
            style={{ left: pct(t.at % W, W), top: pct(Math.floor(t.at / W), H), width: pct(1, W), height: pct(1, H) }}
            onClick={() => tap(t.at)}
            disabled={result !== null}
            aria-label={`${TOWERS[t.kind].name} level ${t.level}, row ${Math.floor(t.at / W) + 1} column ${(t.at % W) + 1}`}
          >
            <span className={"fm-glyph " + t.kind} aria-hidden="true" />
            <span className="fm-level" aria-hidden="true">
              {Array.from({ length: t.level }, (_, i) => <i key={i} />)}
            </span>
          </button>
        ))}

        {!result && !run.over &&
          Array.from({ length: W * H }, (_, c) =>
            onPath.has(c) || run.towers.some((t) => t.at === c) ? null : (
              <button
                key={c}
                className={"fm-plot" + (run.coins >= TOWERS[holding].cost ? " can" : "")}
                style={{ left: pct(c % W, W), top: pct(Math.floor(c / W), H), width: pct(1, W), height: pct(1, H) }}
                onClick={() => tap(c)}
                aria-label={`empty ground, row ${Math.floor(c / W) + 1} column ${(c % W) + 1}`}
              />
            )
          )}

        {shown.map((m) => {
          const p = posOf(m.at);
          const full = Math.max(PESTS[m.kind].hp, m.hp);
          return (
            <span
              key={m.id}
              className={"fm-pest " + m.kind + (m.slowed ? " slowed" : "") + (struck.has(m.id) ? " struck" : "")}
              style={{ left: pct(p.x, W), top: pct(p.y, H), width: pct(1, W), height: pct(1, H) }}
              aria-hidden="true"
            >
              <i className="fm-hp" style={{ width: `${Math.max(0, (m.hp / full) * 100)}%` }} />
            </span>
          );
        })}

        {/* something dying should be seen, not merely absent next frame */}
        {now?.died.map((id) => {
          const was = result?.frames[Math.max(0, frame - 1)].motes.find((m) => m.id === id);
          if (!was) return null;
          const p = posOf(was.at);
          return (
            <span key={"d" + id} className="fm-gone" aria-hidden="true"
              style={{ left: pct(p.x, W), top: pct(p.y, H), width: pct(1, W), height: pct(1, H) }} />
          );
        })}

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

      {chosen && !result && (
        <div className="fm-said">
          <span>
            <b>{TOWERS[chosen.kind].name}</b> level {chosen.level} · hits {statsOf(chosen).damage},
            reaches {statsOf(chosen).range}
          </span>
          <span className="fm-act">
            {upgradeCost(chosen) !== null ? (
              <button
                className="tool"
                onClick={() => setRun((r) => upgrade(r, chosen.at))}
                disabled={run.coins < (upgradeCost(chosen) ?? Infinity)}
              >
                Upgrade · {upgradeCost(chosen)}
              </button>
            ) : (
              <span className="fm-max">as good as it gets</span>
            )}
            <button className="tool" onClick={() => { setRun((r) => sell(r, chosen.at)); setPicked(null); }}>
              Sell · {sellValue(chosen)}
            </button>
          </span>
        </div>
      )}

      <div className="fm-tools noprint">
        {!result ? (
          <button className="tool" onClick={nightfall} disabled={run.over}>
            Send in the night
          </button>
        ) : (
          <>
            <button className="tool" onClick={() => setPlaying((p) => !p)} disabled={done}>
              {playing ? "Pause" : "Play"}
            </button>
            <button className="tool" onClick={() => setSpeed((s) => (s >= 8 ? 1 : s * 2))} disabled={done}>
              {speed}× speed
            </button>
            <button className="tool" onClick={() => { setPlaying(false); setFrame(result.frames.length - 1); }} disabled={done}>
              Skip
            </button>
            {done && !lost && (
              <button className="tool" onClick={carryOn}>
                Morning · +{result.earned + STIPEND}
              </button>
            )}
            {done && lost && <button className="tool" onClick={startOver}>Try again</button>}
          </>
        )}
      </div>

      <div className="status">
        <span>
          {result
            ? `Tick ${now?.tick ?? 0} of ${result.frames.length - 1} · ${shown.length} still out there`
            : `${run.towers.length} standing · ${nightsSurvived(run)} nights survived`}
        </span>
        <span>
          {result
            ? `${soFar.killed} stopped, ${soFar.leaked} got through`
            : "tap the ground to build"}
        </span>
      </div>

      {done && result && (
        <div className="win show">
          {lost
            ? `They got in. You lasted ${nightsSurvived(run) + 1} nights.`
            : result.held
              ? `Nothing got through. ${result.killed} stopped, ${result.earned} coins earned.`
              : `${result.leaked} got through. ${result.killed} stopped, ${result.earned} coins earned.`}
        </div>
      )}

      <footer>
        <span>Smallholding · the night is decided before you watch it</span>
        <span>an early look — nothing is saved yet</span>
      </footer>
    </div>
  );
}
