/**
 * Cosmetic themes, ported verbatim from the design handoff.
 *
 * THE BOUNDARY, WHICH IS THE WHOLE POINT
 *
 * A theme changes the *play furniture* — the ground under the sheet, the
 * background, the shell's ink and rules, the keypad, the buttons, the
 * on-screen selection. It does not touch the *printed layer*: everything
 * inside the puzzle grid keeps a fixed palette in every theme and every mode,
 * because a themed page and a printed page have to be the same puzzle.
 *
 * The fixed eight live in player.css and are never emitted here:
 *   #111111 ink · #514B45 body · #7A736C muted · #E4DFD8 rule
 *   #F4F1EC tile · #F5A9C6 accent · #FDEFF4 tint · #C4467E deep
 *
 * So the themed accent is a *separate token* — `--fill` — and the sheet's
 * `--accent` is left alone. Using one token for both is the mistake this file
 * exists to prevent: it would repaint the given letters inside the grid every
 * time someone picked a new theme.
 *
 * TWO RULES WORTH KEEPING IN VIEW
 *
 * 1. Anything sitting *on* a fill — a key, a button, a tile, an avatar — takes
 *    the fixed ink #111111, never the shell ink. Fills are light pastels in
 *    both modes, so shell ink inverts to near-white in dark mode and lands at
 *    1.3:1. The handoff names this as the easiest way to break the page.
 * 2. The accent's *text* step differs by mode: the dark step on light grounds,
 *    the fill itself on dark grounds. The deep steps measure 2.4–3.2:1 on dark
 *    grounds and must never be used there.
 *
 * Every ratio below was measured by design against the ground it actually sits
 * on. They are carried across as data so a future change can be checked rather
 * than guessed at.
 */

export type Mode = "light" | "dark";

export type Palette = {
  ground: string;
  ink: string;
  body: string;
  muted: string;
  rule: string;
  /** Accent as *text* — already the correct step for this mode. */
  acc: string;
};

export type Theme = {
  name: string;
  note: string;
  /** The themed fill. Light pastel in both modes; fixed ink goes on top. */
  fill: string;
  /** Colourways only exist for Notebook. */
  ways?: boolean;
  /** The one sanctioned exception — see `paper` below. */
  paper?: string;
  bgLight: string;
  bgDark: string;
  bgSize: string;
  light: Palette;
  dark: Palette;
};

export type Way = {
  name: string;
  fill: string;
  /** The dark step, for use as text on a light ground only. */
  accLight: string;
};

/**
 * Notebook's six colourways. Ground and shell are identical across all of them
 * — only the fill and its text step change — so one measured shell covers the
 * set.
 */
export const WAYS: Way[] = [
  { name: "Rose", fill: "#F5A9C6", accLight: "#B03A6E" },
  { name: "Butter", fill: "#F0CE72", accLight: "#8A6212" },
  { name: "Sage", fill: "#B7CCA6", accLight: "#426B3C" },
  { name: "Clay", fill: "#E9A07A", accLight: "#A34A22" },
  { name: "Cornflower", fill: "#AAC1E6", accLight: "#31558C" },
  { name: "Lilac", fill: "#C9B3E0", accLight: "#5C4489" },
];

export const THEMES: Theme[] = [
  {
    name: "Notebook",
    note: "ruled paper and ink — the default, in six colourways",
    fill: "#F5A9C6",
    ways: true,
    bgLight:
      "repeating-linear-gradient(#FBFBF9 0px, #FBFBF9 31px, #E6EAEA 31px, #E6EAEA 32px)",
    bgDark:
      "repeating-linear-gradient(#151719 0px, #151719 31px, #262A2C 31px, #262A2C 32px)",
    bgSize: "auto",
    light: { ground: "#FBFBF9", ink: "#14161A", body: "#454C52", muted: "#5F6A6F", rule: "#E2E7E7", acc: "#B03A6E" },
    dark: { ground: "#151719", ink: "#F2F4F5", body: "#C9CFD2", muted: "#98A0A4", rule: "#262A2C", acc: "#F5A9C6" },
  },
  {
    name: "Kitchen Table",
    note: "warm, floury, a bit worn",
    fill: "#F5A9C6",
    bgLight: "radial-gradient(rgba(176,58,110,0.16) 0.9px, transparent 0.9px)",
    bgDark: "radial-gradient(rgba(245,169,198,0.16) 0.9px, transparent 0.9px)",
    bgSize: "9px 9px",
    light: { ground: "#F6F1E8", ink: "#1E1B18", body: "#4A423A", muted: "#6E6459", rule: "#DED2BD", acc: "#B03A6E" },
    dark: { ground: "#1A1517", ink: "#F4EFE7", body: "#CFC5B8", muted: "#A2988C", rule: "#342B2D", acc: "#F5A9C6" },
  },
  {
    name: "Garden Shed",
    note: "green shade, sawdust, seed packets",
    fill: "#A7C4A0",
    bgLight: "repeating-linear-gradient(46deg, rgba(47,107,63,0.13) 0 1.5px, transparent 1.5px 11px)",
    bgDark: "repeating-linear-gradient(46deg, rgba(167,196,160,0.16) 0 1.5px, transparent 1.5px 11px)",
    bgSize: "auto",
    light: { ground: "#EEF3E6", ink: "#18200F", body: "#3E4A33", muted: "#5A684E", rule: "#D2DEC4", acc: "#2F6B3F" },
    dark: { ground: "#121A14", ink: "#EAF1E4", body: "#C2CFB9", muted: "#94A38B", rule: "#26332A", acc: "#A7C4A0" },
  },
  {
    name: "Lamplight",
    note: "one bulb, late, nobody waiting up",
    fill: "#E8C46A",
    bgLight: "radial-gradient(90% 62% at 50% -8%, rgba(232,196,106,0.55), transparent 72%)",
    bgDark: "radial-gradient(90% 62% at 50% -8%, rgba(232,196,106,0.26), transparent 72%)",
    bgSize: "auto",
    light: { ground: "#FBF1DE", ink: "#241B10", body: "#55452E", muted: "#77644A", rule: "#EBD9B4", acc: "#8A5A16" },
    dark: { ground: "#1E1710", ink: "#F7EBD6", body: "#D8C4A4", muted: "#A8917A", rule: "#332819", acc: "#E8C46A" },
  },
  {
    name: "Deep Winter",
    note: "slate, frost, thin light",
    fill: "#9FB8CE",
    bgLight: "repeating-linear-gradient(#EAEFF3 0 13px, rgba(44,90,124,0.10) 13px 14px)",
    bgDark: "repeating-linear-gradient(#12171B 0 13px, rgba(159,184,206,0.13) 13px 14px)",
    bgSize: "auto",
    light: { ground: "#EAEFF3", ink: "#12171B", body: "#3E4850", muted: "#5A666E", rule: "#CFD9E0", acc: "#2C5A7C" },
    dark: { ground: "#12171B", ink: "#EDF1F3", body: "#C3CDD3", muted: "#93A0A7", rule: "#273037", acc: "#9FB8CE" },
  },
  {
    name: "Starry Night",
    note: "clear, cold and crowded overhead",
    fill: "#9FDCE8",
    bgLight:
      "radial-gradient(rgba(40,69,127,0.30) 0.9px, transparent 0.9px), radial-gradient(rgba(40,69,127,0.16) 0.7px, transparent 0.7px), linear-gradient(163deg, rgba(255,255,255,0.85) 30%, transparent 62%)",
    bgDark:
      "radial-gradient(rgba(238,241,250,0.85) 1.1px, transparent 1.1px), radial-gradient(rgba(159,220,232,0.45) 0.8px, transparent 0.8px), linear-gradient(163deg, rgba(159,220,232,0.16) 28%, transparent 60%)",
    bgSize: "27px 27px, 13px 13px, auto",
    light: { ground: "#E7ECF8", ink: "#121727", body: "#3D455F", muted: "#58607C", rule: "#CBD3E8", acc: "#28457F" },
    dark: { ground: "#0B0F1E", ink: "#EEF1FA", body: "#C3CAE0", muted: "#9099B5", rule: "#1F2438", acc: "#9FDCE8" },
  },
  {
    name: "Full Moon",
    note: "the one that reaches the paper",
    fill: "#C8CBE0",
    /**
     * The single sanctioned exception to the fixed printed layer: in dark mode
     * the sheet's paper shifts #FFFFFF → #FCFDFF. The metaphor survives —
     * paper seen by moonlight, not paper that changed colour — but it spends
     * the entire contrast budget, taking the sheet's muted label from 4.67:1 to
     * 4.59:1. Nothing cooler than #FCFDFF is available.
     */
    paper: "#FCFDFF",
    bgLight:
      "radial-gradient(34% 26% at 84% 10%, rgba(255,255,255,0.95), transparent 68%), radial-gradient(rgba(72,77,119,0.20) 0.9px, transparent 0.9px)",
    bgDark:
      "radial-gradient(34% 26% at 84% 10%, rgba(200,203,224,0.30), transparent 68%), radial-gradient(rgba(200,203,224,0.24) 0.9px, transparent 0.9px)",
    bgSize: "auto, 20px 20px",
    light: { ground: "#E9EBF4", ink: "#14161E", body: "#414655", muted: "#5C6373", rule: "#D2D6E6", acc: "#484D77" },
    dark: { ground: "#0E1017", ink: "#EEF0F7", body: "#C4C9D6", muted: "#939BAC", rule: "#242833", acc: "#C8CBE0" },
  },
];

export const DEFAULT_THEME = "Notebook";
export const DEFAULT_WAY = "Rose";

export type Choice = { theme: string; way: string; mode: Mode | "auto" };

export const STORAGE_KEY = "pz:theme";

export const themeByName = (name: string) =>
  THEMES.find((t) => t.name === name) ?? THEMES[0];
export const wayByName = (name: string) => WAYS.find((w) => w.name === name) ?? WAYS[0];

/**
 * The custom properties a choice resolves to.
 *
 * Kept as a plain function with no DOM access so the same code runs in the
 * blocking script that paints the first frame, in React, and in a test.
 */
export function tokensFor(choice: Choice, resolved: Mode): Record<string, string> {
  const theme = themeByName(choice.theme);
  const pal = resolved === "dark" ? theme.dark : theme.light;

  // Only Notebook has colourways; every other theme carries its own single fill.
  const way = theme.ways ? wayByName(choice.way) : null;
  const fill = way ? way.fill : theme.fill;
  // The dark step on light grounds; the fill itself on dark grounds. Deep steps
  // measure 2.4–3.2:1 on a dark ground and must never appear there.
  const accText = resolved === "dark" ? fill : (way ? way.accLight : pal.acc);

  return {
    "--ground": pal.ground,
    "--shell-ink": pal.ink,
    "--shell-body": pal.body,
    "--shell-muted": pal.muted,
    "--shell-rule": pal.rule,
    "--fill": fill,
    "--fill-text": accText,
    "--ground-bg": resolved === "dark" ? theme.bgDark : theme.bgLight,
    "--ground-bg-size": theme.bgSize,
    // Full Moon in dark mode is the only theme allowed to touch the paper.
    "--paper": resolved === "dark" && theme.paper ? theme.paper : "#FFFFFF",
  };
}
