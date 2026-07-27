/**
 * The site's identity, in one place.
 *
 * The name was scattered across the layout metadata, the home page, each game's
 * page title and — worst — the localStorage key that half-finished puzzles are
 * saved under. That last one made renaming genuinely expensive: change the
 * prefix and every save already on someone's device stops being found.
 *
 * So the name lives here and the storage prefix does not use it at all. That
 * paid off on 2026-07-27: renaming from the placeholder "Playhouse" to
 * **Gameroom** was editing this file, and not one save was orphaned.
 */

export const SITE = {
  /** Full name, for page titles and prose. */
  name: "Gameroom",
  /**
   * The wordmark, split in two — the second half takes the accent colour.
   * Split where the name has a natural seam (Game·room).
   */
  wordmark: ["Game", "room"] as [string, string],
  /**
   * The home page headline. It lives here because it used to pun on the name:
   * "Puzzles, on the house" was a Playhouse joke and would have been left
   * stranded by the rename. This is brand's own strapline instead.
   */
  tagline: "Puzzles, kept at home.",
  /** Under 155 characters: this is the search result and the link preview. */
  description: "Puzzles and games, kept at home. Play free — sign in to keep your progress.",
} as const;

/** `Codeword — Gameroom`, without hard-coding the second half anywhere. */
export const pageTitle = (section: string) => `${section} — ${SITE.name}`;
