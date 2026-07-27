/**
 * The Gameroom mark — a window of four panes with one lit.
 *
 * Inlined rather than loaded as an <img>, for two reasons that both matter.
 *
 * The lettered sizes set G and R in Fredoka, and an SVG inside an <img> is an
 * isolated document: it cannot see the font this page embeds, so the glyphs
 * would silently fall back and the metrics would shift. Inline, they use the
 * same embedded face as everything else.
 *
 * And the ink is `currentColor`, so the mark inverts with the shell instead of
 * needing the separate reversed file. On a dark theme the stroke follows
 * --shell-ink to near-white on its own, which is exactly what that file is for.
 *
 * The lit pane keeps the brand pink rather than taking the theme fill. It is a
 * mark, not furniture — and brand is explicit that the pink is never
 * load-bearing, so the mono print version loses only warmth.
 *
 * Stroke weight does not scale linearly: it rises as the mark shrinks so the
 * drawing never goes spidery, and the letters drop below 48px because they stop
 * being legible. The ladder is brand's, reproduced here rather than by shipping
 * seven near-identical files.
 */
export default function Mark({ size = 22 }: { size?: number }) {
  const stroke = size >= 96 ? 3.6 : size >= 48 ? 5.4 : size >= 24 ? 7 : 10;
  const letters = size >= 48;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flex: "none" }}
    >
      <rect x="49.6" y="49.6" width="38" height="38" rx="1.5" fill="#F5A9C6" stroke="none" />
      <path d="M14.6 13.2c-1.7.2-2.5 1.1-2.4 2.8l1 69c0 1.8 1 2.6 2.8 2.5l68.8-.7c1.8 0 2.6-.9 2.5-2.7l-1-69c0-1.7-1-2.5-2.8-2.4z" />
      <path d="M13.8 50.2c11-1 22.4-1.5 34.4-1.4 12 .1 24 .7 36 1.7" />
      <path d="M49.6 16c1 10.8 1.4 22.2 1.3 34 0 11.8-.5 23.2-1.4 34" />
      {letters && (
        <>
          <text
            x="31" y="41" textAnchor="middle" stroke="none" fill="currentColor"
            fontFamily="var(--display)" fontWeight="600" fontSize="24"
          >
            G
          </text>
          <text
            x="69" y="79" textAnchor="middle" stroke="none" fill="currentColor"
            fontFamily="var(--display)" fontWeight="600" fontSize="24"
          >
            R
          </text>
        </>
      )}
    </svg>
  );
}
