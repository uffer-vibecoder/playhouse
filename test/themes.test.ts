import { test } from "node:test";
import assert from "node:assert/strict";
import {
  THEMES,
  WAYS,
  DEFAULT_THEME,
  DEFAULT_WAY,
  tokensFor,
  type Mode,
} from "../src/lib/themes.ts";

/** WCAG relative luminance, then the ratio between two hex colours. */
const lum = (hex: string) => {
  const ch = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

const choice = (theme: string, way = DEFAULT_WAY) => ({ theme, way, mode: "auto" as const });
const MODES: Mode[] = ["light", "dark"];

/* ── the contrast design measured must actually hold ─────────────────────── */

test("every theme's shell text clears 4.5:1 on its own ground, in both modes", () => {
  for (const theme of THEMES) {
    for (const mode of MODES) {
      const t = tokensFor(choice(theme.name), mode);
      const ground = t["--ground"];
      for (const token of ["--shell-ink", "--shell-body", "--shell-muted"]) {
        const r = ratio(t[token], ground);
        assert.ok(
          r >= 4.5,
          `${theme.name} ${mode}: ${token} is ${r.toFixed(2)}:1 on ${ground}`
        );
      }
    }
  }
});

test("the accent text step clears 4.5:1 on its own ground, in both modes", () => {
  // This is the rule that is easy to get wrong: the deep step belongs on light
  // grounds only, and measures 2.4–3.2:1 on a dark one.
  for (const theme of THEMES) {
    for (const mode of MODES) {
      const t = tokensFor(choice(theme.name), mode);
      const r = ratio(t["--fill-text"], t["--ground"]);
      assert.ok(r >= 4.5, `${theme.name} ${mode}: accent text is ${r.toFixed(2)}:1`);
    }
  }
});

test("every colourway's accent text clears 4.5:1, in both modes", () => {
  for (const way of WAYS) {
    for (const mode of MODES) {
      const t = tokensFor(choice("Notebook", way.name), mode);
      const r = ratio(t["--fill-text"], t["--ground"]);
      assert.ok(r >= 4.5, `${way.name} ${mode}: accent text is ${r.toFixed(2)}:1`);
    }
  }
});

test("fixed ink on every fill clears 4.5:1 — the rule most easily broken", () => {
  // Anything sitting on a fill takes #111111, never the shell ink: fills are
  // light pastels in both modes, so an inverted shell ink lands around 1.3:1.
  const INK = "#111111";
  for (const theme of THEMES) {
    for (const mode of MODES) {
      const t = tokensFor(choice(theme.name), mode);
      const r = ratio(INK, t["--fill"]);
      assert.ok(r >= 4.5, `${theme.name} ${mode}: ink on fill is ${r.toFixed(2)}:1`);
    }
  }
  for (const way of WAYS) {
    const r = ratio(INK, way.fill);
    assert.ok(r >= 4.5, `${way.name}: ink on fill is ${r.toFixed(2)}:1`);
  }
});

test("shell ink on a fill would fail in dark mode — the reason the rule exists", () => {
  const t = tokensFor(choice("Notebook"), "dark");
  const r = ratio(t["--shell-ink"], t["--fill"]);
  assert.ok(r < 2, `expected shell ink on fill to be unusable, got ${r.toFixed(2)}:1`);
});

/* ── the tint ────────────────────────────────────────────────────────────── */

test("the tint reproduces the sheet's own accent pairing", () => {
  // #F5A9C6 mixed 80% toward white is #FDEFF4 — the fixed --accent-tint. Rose
  // is the sheet's accent, so its themed tint must land on the same value.
  const t = tokensFor(choice("Notebook", "Rose"), "light");
  assert.equal(t["--fill"].toUpperCase(), "#F5A9C6");
  assert.equal(t["--fill-tint"].toUpperCase(), "#FDEFF4");
});

/* ── the two-layer rule ──────────────────────────────────────────────────── */

test("no theme emits any of the sheet's fixed tokens", () => {
  const FIXED = ["--ink", "--body", "--muted", "--rule", "--tile", "--accent", "--accent-tint", "--accent-deep"];
  for (const theme of THEMES) {
    for (const mode of MODES) {
      const keys = Object.keys(tokensFor(choice(theme.name), mode));
      for (const f of FIXED) {
        assert.ok(!keys.includes(f), `${theme.name} ${mode} emits ${f}`);
      }
    }
  }
});

test("only Full Moon in dark mode moves the paper", () => {
  for (const theme of THEMES) {
    for (const mode of MODES) {
      const paper = tokensFor(choice(theme.name), mode)["--paper"];
      const exception = theme.name === "Full Moon" && mode === "dark";
      assert.equal(
        paper,
        exception ? "#FCFDFF" : "#FFFFFF",
        `${theme.name} ${mode} paper`
      );
    }
  }
});

/* ── shape ───────────────────────────────────────────────────────────────── */

test("colourways only apply to the theme that has them", () => {
  // Picking a colourway while on Garden Shed must not tint Garden Shed.
  const shed = tokensFor(choice("Garden Shed", "Butter"), "light");
  assert.equal(shed["--fill"].toUpperCase(), "#A7C4A0");
  const book = tokensFor(choice("Notebook", "Butter"), "light");
  assert.equal(book["--fill"].toUpperCase(), "#F0CE72");
});

test("an unknown theme or colourway falls back rather than throwing", () => {
  const t = tokensFor({ theme: "Nonsense", way: "Nonsense", mode: "auto" }, "light");
  assert.equal(t["--ground"], THEMES[0].light.ground);
  assert.equal(t["--fill"].toUpperCase(), WAYS[0].fill.toUpperCase());
});

test("the defaults name real things", () => {
  assert.ok(THEMES.some((t) => t.name === DEFAULT_THEME));
  assert.ok(WAYS.some((w) => w.name === DEFAULT_WAY));
  assert.equal(THEMES.length, 7);
  assert.equal(WAYS.length, 6);
});
