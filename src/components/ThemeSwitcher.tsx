"use client";

import { useState } from "react";
import { THEMES, WAYS, themeByName } from "@/lib/themes";
import { useTheme } from "@/lib/use-theme";

/**
 * The theme panel from design 4g.
 *
 * Seven themes, six colourways for the one theme that has them, and a
 * light/dark toggle. It sits in the top bar on every page, folded away until
 * asked for — picking a look is a once-in-a-while act, not a control that
 * should compete with the puzzle.
 *
 * Every swatch and pill takes the fixed ink `#111111` rather than the shell
 * ink. Fills are light pastels in both modes, so an inverted shell ink would
 * land near 1.3:1 on them — the single easiest way to break the page, per the
 * handoff.
 */
export default function ThemeSwitcher() {
  const { choice, setChoice, resolved } = useTheme();
  const [open, setOpen] = useState(false);
  const current = themeByName(choice.theme);

  return (
    <>
      <button
        className="linkish"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={`${current.name}, ${resolved}`}
      >
        Theme
      </button>

      {open && (
        <div className="dialog themepanel">
          <h3>How it looks</h3>
          <p>
            Seven of them, in light and dark. The puzzle sheet stays the same in every one —
            a themed page and a printed page are the same puzzle.
          </p>

          <div className="themegrid">
            {THEMES.map((t) => {
              const on = t.name === choice.theme;
              return (
                <button
                  key={t.name}
                  className={"themepill" + (on ? " on" : "")}
                  aria-pressed={on}
                  onClick={() => setChoice({ ...choice, theme: t.name })}
                  title={t.note}
                >
                  <span
                    className="themedot"
                    style={{ background: t.ways ? undefined : t.fill }}
                    data-way={t.ways ? "yes" : undefined}
                  />
                  {t.name}
                </button>
              );
            })}
          </div>

          {current.ways && (
            <div className="ways">
              <span className="wayslabel">Colour</span>
              {WAYS.map((w) => (
                <button
                  key={w.name}
                  className={"waydot" + (w.name === choice.way ? " on" : "")}
                  style={{ background: w.fill }}
                  aria-pressed={w.name === choice.way}
                  aria-label={w.name}
                  title={w.name}
                  onClick={() => setChoice({ ...choice, way: w.name })}
                />
              ))}
            </div>
          )}

          <div className="modes">
            {(["light", "dark", "auto"] as const).map((m) => (
              <button
                key={m}
                className={"modebtn" + (choice.mode === m ? " on" : "")}
                aria-pressed={choice.mode === m}
                onClick={() => setChoice({ ...choice, mode: m })}
              >
                {m === "auto" ? "Match my device" : m}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
