"use client";

import type { GameRecord } from "@/lib/record";

/**
 * The four stat shapes, from design 2c.
 *
 * They are deliberately **not interchangeable**. A uniform stat row would
 * misrepresent at least two of these games — Codeword has no score at all, and
 * the word game's whole story is the shape of its distribution rather than any
 * single number. The rule is to add a shape rather than force a game into an
 * existing one.
 */

/** One cell per puzzle, filled or empty. Twenty to a row. */
function Archive({ r }: { r: GameRecord }) {
  const { total, done } = r.archive!;
  return (
    <div className="shape">
      <div className="arch" role="img" aria-label={`${done} of ${total} finished`}>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={"archcell" + (i < done ? " on" : "")} />
        ))}
      </div>
      {!!r.sets?.length && (
        <div className="setrows">
          {r.sets.map((s) => (
            <div className="setrow" key={s.name}>
              <span className="setname">{s.name}</span>
              <span className="setdots" aria-label={`${s.done} of ${s.of}`}>
                {Array.from({ length: s.of }, (_, i) => (
                  <span key={i} className={"setdot" + (i < s.done ? " on" : "")} />
                ))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Six bars, one per guess count.
 *
 * All one fill on a white track. The most common result carries an inner rule
 * rather than a second colour — introducing a hue here would imply a meaning
 * the data does not have.
 */
function Distribution({ r }: { r: GameRecord }) {
  const d = r.distribution!;
  const most = Math.max(...d);
  return (
    <div className="shape">
      <div className="dist">
        {d.map((n, i) => (
          <div className="distrow" key={i}>
            <span className="distn">{i + 1}</span>
            <span className="disttrack">
              <span
                className={"distbar" + (n === most && n > 0 ? " mode" : "")}
                style={{ width: most > 0 ? `${(n / most) * 100}%` : "0%" }}
              />
            </span>
            <span className="distcount">{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** One row per recent set, `outOf` marks filled to the score. */
function ScoreRows({ r }: { r: GameRecord }) {
  const outOf = r.outOf ?? 10;
  return (
    <div className="shape">
      {r.recent?.length ? (
        <div className="scorerows">
          {r.recent.map((row) => (
            <div className="scorerow" key={row.label}>
              <span className="scorelabel">{row.label}</span>
              <span className="scoremarks" aria-label={`${row.score} of ${outOf}`}>
                {Array.from({ length: outOf }, (_, i) => (
                  <span key={i} className={"scoremark" + (i < row.score ? " on" : "")} />
                ))}
              </span>
              <span className="scoren">{row.score}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="nothingyet">Nothing finished yet.</p>
      )}
    </div>
  );
}

/**
 * A run's shape: the best, and the last few.
 *
 * No grid of completions, because there is nothing to complete. The bars are
 * relative to the best rather than to a fixed ceiling — a run game has no
 * maximum, so the only honest scale is your own.
 */
function Run({ r }: { r: GameRecord }) {
  const scores = r.lastFive ?? [];
  const top = r.best?.score ?? 0;
  if (!scores.length) {
    return <p className="nothingyet">Play one and it will be here.</p>;
  }
  return (
    <div className="runshape">
      {scores.map((n, i) => (
        <span className="runbar" key={i} title={`${n}`}>
          <span
            style={{ height: `${top ? Math.max(6, (n / top) * 100) : 6}%` }}
            className={n === top ? "onbest" : ""}
          />
          <b>{n}</b>
        </span>
      ))}
    </div>
  );
}

export default function StatShape({ record }: { record: GameRecord }) {
  switch (record.shape) {
    case "archive":
      return <Archive r={record} />;
    case "distribution":
      return <Distribution r={record} />;
    case "scoreRows":
      return <ScoreRows r={record} />;
    case "run":
      return <Run r={record} />;
    case "draft":
      return null;
  }
}

/** The headline number on the right of an entry — or an em dash. */
export function Headline({ record }: { record: GameRecord }) {
  if (record.shape === "draft") return null;

  if (record.shape === "scoreRows") {
    return record.average === null || record.average === undefined ? (
      <div className="headline">
        {/* Not a gap: nothing has been finished, and saying so beats a zero. */}
        <span className="headnum dash">—</span>
        <span className="headlabel">no sets finished</span>
      </div>
    ) : (
      <div className="headline">
        <span className="headnum">{record.average.toFixed(1)}</span>
        <span className="headlabel">average out of {record.outOf}</span>
      </div>
    );
  }

  if (record.shape === "run") {
    return record.best ? (
      <div className="headline">
        <span className="headnum">{record.best.score}</span>
        <span className="headlabel">
          best{record.best.detail ? ` · ${record.best.detail}` : ""}
        </span>
      </div>
    ) : (
      <div className="headline">
        {/* Not zero: nobody has scored nothing, nobody has played. */}
        <span className="headnum dash">—</span>
        <span className="headlabel">nothing scored yet</span>
      </div>
    );
  }

  if (record.shape === "distribution") {
    return (
      <div className="headline">
        <span className="headnum">{record.solved ?? 0}</span>
        <span className="headlabel">solved</span>
      </div>
    );
  }

  return (
    <div className="headline">
      <span className="headnum">{record.archive?.done ?? 0}</span>
      <span className="headlabel">of {record.archive?.total ?? 0} finished</span>
    </div>
  );
}
