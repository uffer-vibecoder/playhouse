/**
 * Stamps — what has actually been finished.
 *
 * Pure and dependency-free: it takes the set of finished slots and the archives
 * and returns what has been earned. No DOM, no storage, no fetch, so the same
 * function serves the landing page's strip and the dashboard's stamps page, and
 * a test can hand it a made-up archive.
 *
 * TWO RULES FROM THE HANDOFF, WORTH KEEPING IN VIEW
 *
 * Stamps are for *finishing things* — a themed set, a whole archive — never for
 * turning up. There is no stamp for playing, for coming back, or for a streak.
 *
 * And an unearned stamp keeps its name and its requirement. Hiding what you
 * have not got, or showing it as a locked silhouette, is what turns this into a
 * loyalty scheme; the point is that you can see what is there and decide
 * whether you want it.
 */

export type Stamp = {
  id: string;
  /** Short label, as it appears on the postmark. */
  name: string;
  /** What earns it, in full, shown whether or not it has been. */
  requirement: string;
  done: number;
  of: number;
  earned: boolean;
};

/** A game's archive as far as this module cares. */
export type ArchiveEntry = { id: string; theme?: string };

export type Games = {
  id: string;
  name: string;
  puzzles: ArchiveEntry[];
  /** Builds the slot key for a puzzle, so this module never guesses at one. */
  slotOf: (p: ArchiveEntry) => string;
};

/**
 * Every stamp, earned and not, in a stable order: themed sets first in archive
 * order, then one per whole archive.
 */
export function stamps(games: Games[], solved: Set<string>): Stamp[] {
  const out: Stamp[] = [];

  for (const game of games) {
    /* Themed sets — currently only Codeword has them. A set completes when all
       of its puzzles are finished, in any order; there is no sequence to keep. */
    const themes = new Map<string, ArchiveEntry[]>();
    for (const p of game.puzzles) {
      if (!p.theme) continue;
      const list = themes.get(p.theme);
      if (list) list.push(p);
      else themes.set(p.theme, [p]);
    }

    for (const [theme, list] of themes) {
      const done = list.filter((p) => solved.has(game.slotOf(p))).length;
      out.push({
        id: `${game.id}:set:${theme}`,
        name: theme,
        requirement: `Finish all ${list.length} ${theme} puzzles`,
        done,
        of: list.length,
        earned: done === list.length,
      });
    }
  }

  for (const game of games) {
    const done = game.puzzles.filter((p) => solved.has(game.slotOf(p))).length;
    out.push({
      id: `${game.id}:archive`,
      name: `All of ${game.name}`,
      requirement: `Finish every ${game.name} puzzle`,
      done,
      of: game.puzzles.length,
      earned: game.puzzles.length > 0 && done === game.puzzles.length,
    });
  }

  return out;
}

export const earnedCount = (all: Stamp[]) => all.filter((s) => s.earned).length;

/**
 * The completed share of an unearned stamp, 0–1, for the dial.
 *
 * An archive with no puzzles in it yet reads as 0 rather than as complete —
 * dividing by zero would otherwise quietly award a stamp for an empty game.
 */
export const share = (s: Stamp) => (s.of === 0 ? 0 : s.done / s.of);

/**
 * The one closest to being earned, for the "two thirds of the way" line.
 *
 * Closest means **fewest puzzles still to do**, not the highest percentage.
 * Those disagree, and the percentage is the wrong one: a whole archive at 71%
 * of eighty puzzles is twenty-three away, while a themed set at 67% is one.
 * Ranking by share would point at the archive and call it nearly done.
 *
 * Ties break toward the higher share, which favours the smaller target again.
 * Anything untouched is ignored, so a fresh archive does not claim to be in
 * progress, and so is anything already earned.
 */
export function nearest(all: Stamp[]): Stamp | null {
  const going = all.filter((s) => !s.earned && s.done > 0);
  if (!going.length) return null;
  return going.reduce((best, s) => {
    const left = s.of - s.done;
    const bestLeft = best.of - best.done;
    if (left !== bestLeft) return left < bestLeft ? s : best;
    return share(s) > share(best) ? s : best;
  });
}
