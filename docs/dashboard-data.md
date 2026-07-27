# Dashboard (2c) — data contract

Design renders the dashboard from a single JSON object; the backend fills it in and design
makes no further decisions. The full contract is design's, reproduced below with our notes
on what we can and cannot supply today.

## What we can build now

Derivable from what already exists in `game_progress` plus the archives:

- `player.finished`, and per-game completion — from the solved set.
- `games[].archive` for Codeword — total from the archive, done from the solved set.
- `games[].distribution` for Word guessing — we persist the guess list, so the bucket is
  `guesses.length` for a solve.
- `failed` — a word puzzle with `guesses.length === TRIES` and no solve. Failures stay
  failed, per rule 4, and our engine already treats them that way.
- `games[].recent[].score` for Solve for x — recomputable from the saved answers.

## What we cannot build until the results migration lands

- **Every time field.** `player.timedAverage`, `timedCount`, `untimedCount` and
  `lately[].time` all need `elapsed_ms`, which nothing records yet.
- **`lately` at all.** It is ordered by completion and we store no `completed_at` — only
  `updated_at`, which moves every time a puzzle is touched.
- **`solve-for-x.average`.** The contract says *"Redoable; the first attempt is the one
  averaged."* Our save is mutable: replaying a set overwrites the answers, so a first
  attempt is not recoverable after the fact. **Recording the first score has to start
  before the average means anything** — it cannot be backfilled.

That last one is the only item here that gets worse with delay. Everything else can be
computed from history whenever we get to it.

## Rules that constrain the implementation, not just the rendering

1. **`time: null` is normal, not missing.** Timing is opt-in and never auto-starts, so most
   rows carry no time. It renders as `—` at full legibility — never greyed, never omitted,
   never zero. Any query that assumes a time exists misrepresents the archive.
2. `timedAverage` averages **timed solves only**, and the label says so. Never average
   across untimed rows by treating them as zero.
3. **Codeword has no score.** Finished or not. No percentage, grade or time as its headline.
4. Failures persist and are never quietly retried.
5. `distribution` is always length 6, zeros included — the shape is the point, so an absent
   bucket is `0`, not dropped.
6. `sets[].done` never exceeds `sets[].of`; a set completes only when they are equal.
7. `recent` is newest first; `label` is display text and design does not parse it.
8. Every string arrives display-ready. Design applies no title-casing, truncation or
   pluralisation.

## Shapes

`shape` picks how a game's numbers are drawn, and they are **not interchangeable** — a
uniform stat row misrepresents at least two of these games. Add a shape rather than forcing
a game into an existing one.

| `shape` | Needs | Draws |
|---|---|---|
| `archive` | `archive.total`, `archive.done`, optional `sets[]` | one cell per puzzle, filled or empty, 20 per row; set rows below as dot groups |
| `distribution` | `distribution[6]`, `solved`, `failed` | six bars on a white track with an ink hairline; the mode carries an inner `#C4467E` rule — never a second hue |
| `scoreRows` | `average`, `outOf`, `best`, `recent[]` | headline average, then one row per recent set as `outOf` marks filled to `score` |
| `draft` | nothing | dashed entry, muted, no numbers |

## Shape of the payload

```jsonc
{
  "player": {
    "name": "Rosa",
    "since": "2026-03",          // YYYY-MM, rendered "kept since march"
    "finished": 96,
    "timedCount": 19,
    "timedAverage": "11:24",     // "m:ss", or null when timedCount is 0
    "untimedCount": 77           // finished - timedCount. A value, not a gap.
  },
  "games": [
    { "id": "codeword", "num": "01", "name": "Codeword", "shape": "archive",
      "note": "Finished or not — no score exists.",
      "archive": { "total": 80, "done": 41 },
      "sets": [{ "name": "In the Garden", "done": 3, "of": 3 }],
      "footer": "A set completes when all three of its puzzles are finished, in any order." },

    { "id": "word-guessing", "num": "02", "name": "Word guessing", "shape": "distribution",
      "note": "38 solved, 2 failed and left failed. Best: two guesses.",
      "distribution": [0, 3, 9, 14, 8, 4], "failed": 2, "solved": 38 },

    { "id": "solve-for-x", "num": "03", "name": "Solve for x", "shape": "scoreRows",
      "note": "17 sets. Redoable; the first attempt is the one averaged.",
      "average": 8.4, "outOf": 10, "best": { "score": 10, "times": 2 },
      "recent": [{ "label": "Set 17", "score": 9 }] },

    { "id": "cryptogram", "num": "04", "name": "Cryptogram", "shape": "draft",
      "note": "in draft — nothing to record yet" }
  ],
  "lately": [
    { "day": "Yesterday", "puzzle": "Codeword No. 40", "result": "Finished",
      "time": "14:02", "set": "Weather" },
    { "day": "Sunday", "puzzle": "Solve for x · Set 17", "result": "9 of 10",
      "time": null, "set": null }
  ]
}
```

## Layout

- **Desktop (2c):** one entry per game, three zones across — title and note (200px), the stat
  shape (flexible), the headline number (190px, right-aligned).
- **Phone (3a–3c):** the same three zones stack. Stat shapes keep full width; only numerals
  move above the shape. Rows at least 44px. "Lately" becomes two lines: puzzle and time on
  top, day / result / set beneath.
- The dashboard is themed. Anything on a colourway fill takes fixed ink `#111111`. Nothing
  inside a puzzle sheet is themed.
