# Playhouse — design handoff

Two deliverables live here:

1. **`Codeword Puzzle.dc.html`** — the printable puzzle sheet (finished, in use).
   Data contract in `PUZZLE-FORMAT.md`, sample in `puzzle-001.json`, print shell
   `doc-page.js` must sit in the same folder.
2. **`Playhouse Shell.dc.html`** — the site design: landing (6a/6b), dashboard (2c) and its
   phone screens (3a–3c), achievements (4a/4e/4f), the theme switcher (4g) and the stamp
   animation (5a). Rejected explorations have been removed; every id below still resolves. Open it and pan; every option
   carries a visible id badge (1a…5a) that matches the notes below.

Division of labour: design stays in the design project; generation, validation, batching
and PDF automation belong to Claude Code. Do not restyle the puzzle sheet.

---

## The two-layer rule (read this first)

Everything visual splits in two, and the split is not negotiable:

**Fixed — the printed layer.** Everything inside the puzzle sheet:
```
--ink         #111111   grid ink, letters
--body        #514B45   sheet prose
--muted       #7A736C   code numerals, 10px labels
--rule        #E4DFD8   hairlines
--tile        #F4F1EC   "not in the word" tile
--accent      #F5A9C6   given letters, badges
--accent-tint #FDEFF4   selection wash
--accent-deep #C4467E   strokes ONLY — never text (4.1:1 on cream)
```
These never change — not per theme, not in dark mode. A themed page and a printed page
must be the same puzzle. Small pink text uses `#A3306A` (5.9:1) instead of accent-deep.

**Themeable — the play furniture.** Ground, background, shell ink/body/muted/rule, keypad,
buttons, on-screen selection, worksheet rules, progress rails, live-row tint.

One sanctioned exception: **Full Moon in dark mode** shifts the sheet paper from
`#FFFFFF` to `#FCFDFF`. The metaphor survives (paper seen by moonlight, not paper that
changed colour) but it spends the whole contrast budget — the sheet's muted label goes
4.67:1 → 4.59:1. Nothing cooler than #FCFDFF is available.

---

## Themes (7) — every token measured against its own ground

Each theme ships light + dark. OS preference drives it; `data-theme` on the root overrides
in both directions. Backgrounds are CSS gradients only — nothing fetched — and are dropped
at print. Exact values live in `static THEMES` at the top of the logic class.

**Notebook is the default** — ruled paper and ink — and it is the one theme with colourways.

| Theme | Mode | ground | ink | body | muted | accent text | fill | ink on fill |
|---|---|---|---|---|---|---|---|---|
| Notebook (default) | light | #FBFBF9 | #14161A 17.5 | #454C52 8.4 | #5F6A6F 5.4 | per colourway | per colourway | per colourway |
| Notebook (default) | dark | #151719 | #F2F4F5 16.3 | #C9CFD2 11.4 | #98A0A4 6.8 | per colourway | per colourway | per colourway |
| Kitchen Table | light | #F6F1E8 | #1E1B18 15.2 | #4A423A 8.8 | #6E6459 5.1 | #B03A6E 5.1 | #F5A9C6 | 10.2 |
| Kitchen Table | dark | #1A1517 | #F4EFE7 15.8 | #CFC5B8 10.6 | #A2988C 6.4 | #F5A9C6 9.8 | #F5A9C6 | 10.2 |
| Garden Shed | light | #EEF3E6 | #18200F 14.9 | #3E4A33 8.3 | #5A684E 5.3 | #2F6B3F 5.6 | #A7C4A0 | 9.9 |
| Garden Shed | dark | #121A14 | #EAF1E4 15.4 | #C2CFB9 10.9 | #94A38B 6.7 | #A7C4A0 9.3 | #A7C4A0 | 9.9 |
| Lamplight | light | #FBF1DE | #241B10 15.1 | #55452E 8.2 | #77644A 5.1 | #8A5A16 5.3 | #E8C46A | 11.3 |
| Lamplight | dark | #1E1710 | #F7EBD6 15.0 | #D8C4A4 10.4 | #A8917A 5.9 | #E8C46A 10.6 | #E8C46A | 11.3 |
| Deep Winter | light | #EAEFF3 | #12171B 15.6 | #3E4850 8.1 | #5A666E 5.1 | #2C5A7C 6.3 | #9FB8CE | 9.2 |
| Deep Winter | dark | #12171B | #EDF1F3 15.9 | #C3CDD3 11.2 | #93A0A7 6.7 | #9FB8CE 8.8 | #9FB8CE | 9.2 |
| Starry Night | light | #E7ECF8 | #121727 15.1 | #3D455F 8.0 | #58607C 5.3 | #28457F 7.9 | #9FDCE8 | 12.5 |
| Starry Night | dark | #0B0F1E | #EEF1FA 16.9 | #C3CAE0 11.7 | #9099B5 6.7 | #9FDCE8 12.6 | #9FDCE8 | 12.5 |
| Full Moon | light | #E9EBF4 | #14161E 15.2 | #414655 7.9 | #5C6373 5.1 | #484D77 6.8 | #C8CBE0 | 11.8 |
| Full Moon | dark | #0E1017 | #EEF0F7 16.7 | #C4C9D6 11.5 | #939BAC 6.8 | #C8CBE0 11.8 | #C8CBE0 | 11.8 |

### Notebook colourways (6)

Ground and shell are identical across all six — only the fill and its text step change, so
one measured shell covers the set. Values in `static WAYS`. Accent-text ratios are against
the paper #FBFBF9; the dark column is the fill used as text on #151719.

| Colourway | fill | accent text (light) | on paper | fill as text (dark) | ink #111111 on fill |
|---|---|---|---|---|---|
| Rose (default) | #F5A9C6 | #B03A6E | 5.5 | 9.7 | 10.2 |
| Butter | #F0CE72 | #8A6212 | 5.3 | 11.8 | 12.4 |
| Sage | #B7CCA6 | #426B3C | 6.0 | 10.4 | 11.0 |
| Clay | #E9A07A | #A34A22 | 5.7 | 8.4 | 8.8 |
| Cornflower | #AAC1E6 | #31558C | 7.2 | 9.8 | 10.3 |
| Lilac | #C9B3E0 | #5C4489 | 7.7 | 9.4 | 9.9 |

Rules for adding a theme or colourway:
- accent text = the dark step on light grounds, the fill tint on dark grounds (deep steps
  measure 2.4–3.2:1 on dark grounds and must never be used there);
- **anything sitting on a fill — buttons, keypad keys, tiles, avatars — takes fixed ink
  `#111111`, never the shell ink.** Fills are light pastels in both modes, so shell ink
  inverts to near-white in dark mode and lands at 1.3:1. This is the single easiest way to
  break the page;
- every new token arrives with its measured ratio against the background it actually sits
  on, not against the paper. Minimum 4.5:1 for all text including 10px labels.

## Word guessing — the one thing that must not change

Three states differ by **fill, weight and fade**, never hue:
- right place → solid theme fill, 2px ink border
- right letter, wrong place → 4px accent-deep outline on white
- not in the word → `#F4F1EC` fill, 1.5px `#E4DFD8` border, letter `#6E6459` (5.1:1)

Swapping the theme swaps the fill's hue only. The distinction survives red-green colour
blindness because it was never carrying hue.

## Landing page (6a desktop / 6b phone)

A contents page for "volume one": spine rail, wordmark, then the library as numbered entries
in colourway-tinted boxes — count, one-line blurb, the game's own shape, progress, "Open →".
Draft games sit below as dashed entries. **New games are appended to the bottom; the index
never reorders itself.** It holds eight entries before needing a second column.

Hero carries "Start back on your last puzzle →" with the puzzle name and squares remaining;
the right rail repeats it quietly as "Carry on" alongside the bookmark pips, the live scrap-
paper teaser (a real 5×5 excerpt — click a square and type), and a stamps strip showing
earned postmarks plus the in-progress dial.

The landing is fully themed — ground, background, shell, entry borders and accents all come
from the active theme and colourway. The scrap of sheet inside it keeps the fixed printed
palette in every theme.

## Dashboard (2c / 3a–3c)

One entry per game, each with its native shape — a uniform stat row misrepresents at least
two of them:
- **Codeword** — 80-cell archive grid, filled or not. No score exists.
- **Word guessing** — distribution of guesses 1–6. All bars are one colour on a white track
  with an ink hairline; the mode carries `inset 0 0 0 3px #C4467E`, not a second hue.
- **Solve for x** — score out of ten, shown as ten marks per set plus the average.

**Untimed is normal.** Timing is opt-in and never auto-starts, so most rows have no time.
Render `—` in the muted shell colour at full legibility (5.7:1 on white) and say so in the
header. Never grey it out, never treat it as missing data, never assume a time exists.

Mobile (390×844): the column is already single-column, so each entry's three zones stack —
title, shape, headline number. Stat shapes keep full width; only numerals move. Rows ≥44px.
"Lately" becomes two lines per row: puzzle + time, then day / result / set.

## Achievements

Earned for finishing things (a themed set of three, a whole archive) — never for turning up.
The form is the postmark (4a): a hand-stamp impression on the page.

- Earned: pink impression, `#C4467E` ring stroke, text `#A3306A`.
- Unearned: a ring of 18 tangential dashes lying along the circumference, acting as a dial — the completed share inked
  `#C4467E`, the rest `#C3CBCE`, percentage in the middle. Unearned entries show their name
  and requirement in full; hiding them would make this a loyalty scheme.
- In the moment (4e/5a): a slip laid on the finished sheet's corner. Only on the puzzle that
  completes a set or archive. No sound, no confetti, no loop, stays until dismissed.

Arrival timing (5a), 1.6s total:
```
grid settles    0    → 0.38s   cells warm to #FDEFF4 and back
slip laid down  0.22 → 0.78s   in from the corner, 4° → −1.4°, one 3px overshoot
stamp pressed   0.80 → 1.26s   1.5× → 1× with a 3% rebound
three lines     0.98 → 1.62s   130ms apart, 5px rise
```
`prefers-reduced-motion`: everything appears in final position with a 120ms fade.

## Type

Fredoka (display, grid letters, numbers) + Space Grotesk (UI text). Both must ship as
base64 woff2 data URIs — no CDN, strict CSP. **The design files here link Google Fonts for
preview only; swap to the embedded faces before shipping.** A third family needs to earn its
bytes.

## Print

Backgrounds and theming never print. The puzzle sheet becomes the paper. `Codeword
Puzzle.dc.html` is built on `doc-page.js`, which owns `@page` and pagination — print it
as-is (Letter portrait; `size="a4"` for metric).

## Reference screenshots

- `shot-6a-landing.png` — the landing page
- `shot-6b-landing-phone.png` — landing at 390×844
- `shot-2c-dashboard.png` — the chosen dashboard
- `shot-3a-mobile.png` — same at 390×844
- `shot-4f-achievements.png` — the stamps page, earned + unearned
- `shot-4g-themes.png` — theme panel with the games re-skinned
- `shot-5a-animation.png` — the arrival, final frame

## Files

- `Playhouse Shell.dc.html` — the site design (open this)
- `Codeword Puzzle.dc.html` + `doc-page.js` — the printable sheet
- `PUZZLE-FORMAT.md` + `puzzle-001.json` — puzzle data contract and sample
