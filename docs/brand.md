# Gameroom — brand mark assets

Seven SVGs, one construction. All are the same 100 × 100 viewBox; the only differences are
stroke weight (which rises as the mark shrinks) and whether the G/R are present.

| File | Use | Stroke | Letters |
|---|---|---|---|
| `mark-96.svg` | 96px and up | 3.6 | yes |
| `mark-48.svg` | 48–95px | 5.4 | yes |
| `mark-32.svg` | 24–47px | 7 | no |
| `mark-16.svg` | 16–23px (floor) | 10 | no |
| `mark-mono.svg` | print, ink only — lit pane goes white | 4.4 | yes |
| `mark-reversed.svg` | on dark shells (#151719 and darker) | 4.6 | yes |
| `favicon.svg` | favicon / tab | 10 | no |

## Rules

- **Letters hold to 48px and drop below it.** Under 48px the four panes and the lit corner
  carry the mark on their own.
- **Stroke weight is not scaled linearly** — it rises from 3.6 to 10 units as the mark gets
  smaller so the drawing never goes spidery. Use the file that matches the render size
  rather than scaling one file.
- **Minimum size 16px.** Below that, use the wordmark alone.
- **The pink is never load-bearing.** `mark-mono.svg` is the same mark with a white pane;
  a black-and-white print loses only the warmth.
- **Clear space** on all four sides equals one pane (19 units, i.e. 19% of the mark's width).
- Colours: ink `#14161A` (print ink `#111111`), lit pane `#F5A9C6`, reversed ink `#F2F4F5`.
- The letters reference **Fredoka 600**. The SVGs call the font by name — if the font is not
  present the glyphs fall back and the metrics shift, so for anything shipped either
  (a) embed Fredoka, or (b) convert the two `<text>` elements to outlines. The letterless
  files have no such dependency.

## Wordmark

"Gameroom", Fredoka 600, letter-spacing −0.02em, set at 1.15× the mark's height, with the
mark to its left at a gap of one pane. Strapline (optional): "puzzles, kept at home",
Space Grotesk 400, 10px, letter-spacing 3.2px, in the shell's muted colour.

Reference renderings: `16a-size-ladder.png`, `16b-applications.png`.
