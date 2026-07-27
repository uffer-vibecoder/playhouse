/**
 * The site's identity, in one place.
 *
 * The name was scattered across the layout metadata, the home page, each game's
 * page title and — worst — the localStorage key that half-finished puzzles are
 * saved under. That last one made renaming genuinely expensive: change the
 * prefix and every save already on someone's device stops being found.
 *
 * So the name lives here and the storage prefix does not use it at all. Picking
 * a real name is now editing this file.
 */

export const SITE = {
  /** Full name, for page titles and prose. */
  name: "Playhouse",
  /**
   * The wordmark, split in two — the second half takes the accent colour.
   * Split where the name has a natural seam (Play·house, Back·page).
   */
  wordmark: ["Play", "house"] as [string, string],
  /**
   * The home page headline. It lives here because it puns on the name — swap
   * the name and this has to move with it, which is easy to forget when the
   * two sit in different files.
   */
  tagline: "Puzzles, on the house.",
  /** Under 155 characters: this is the search result and the link preview. */
  description: "Puzzles and games. Play free — sign in to keep your progress.",
} as const;

/** `Codeword — Playhouse`, without hard-coding the second half anywhere. */
export const pageTitle = (section: string) => `${section} — ${SITE.name}`;
