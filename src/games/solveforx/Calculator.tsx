"use client";

import { useState } from "react";

/**
 * Four functions, folded away.
 *
 * Defensible here in a way it would not be in a mental-arithmetic game: the
 * skill on these worksheets is rearranging an equation, not dividing 552 by 12.
 * It is optional and closed by default, so nobody who wants to do it in their
 * head has it in the way.
 *
 * Deliberately not a parser. It evaluates as you go, one operation at a time,
 * like the plastic ones — so `2 + 3 × 4` gives 20 rather than 14. Precedence
 * would need an expression tree, and a calculator that silently disagrees with
 * the one in your drawer is worse than one that is plainly simple.
 */
type Op = "+" | "−" | "×" | "÷";

const round = (n: number) => {
  // enough places to be useful, then trailing zeros trimmed — 1/3 shows as
  // 0.3333333333 rather than as a number in exponent notation
  if (!Number.isFinite(n)) return "—";
  return String(Number(n.toPrecision(10)));
};

export default function Calculator() {
  const [shown, setShown] = useState("0");
  const [held, setHeld] = useState<number | null>(null);
  const [op, setOp] = useState<Op | null>(null);
  /** True once an operator is pressed, so the next digit starts a new number. */
  const [fresh, setFresh] = useState(true);

  const digit = (d: string) => {
    setShown((s) => {
      if (fresh) return d;
      if (s === "0" && d !== ".") return d;
      if (d === "." && s.includes(".")) return s;
      return s.length < 12 ? s + d : s;
    });
    setFresh(false);
  };

  const apply = (a: number, b: number, o: Op) =>
    o === "+" ? a + b : o === "−" ? a - b : o === "×" ? a * b : b === 0 ? NaN : a / b;

  const operate = (next: Op) => {
    const v = Number(shown);
    if (held !== null && op && !fresh) {
      const r = apply(held, v, op);
      setShown(round(r));
      setHeld(Number.isFinite(r) ? r : null);
    } else {
      setHeld(v);
    }
    setOp(next);
    setFresh(true);
  };

  const equals = () => {
    if (held === null || !op) return;
    const r = apply(held, Number(shown), op);
    setShown(round(r));
    setHeld(null);
    setOp(null);
    setFresh(true);
  };

  const clear = () => {
    setShown("0");
    setHeld(null);
    setOp(null);
    setFresh(true);
  };

  const sign = () => {
    setShown((s) => (s.startsWith("-") ? s.slice(1) : s === "0" ? s : "-" + s));
  };

  return (
    <details className="disclosure noprint">
      <summary>
        <span className="chev" />
        Calculator
        <span className="sum-note">optional</span>
      </summary>
      <div className="disclosure-body">
        <div className="sx-calc">
          <output className="sx-calcshow" aria-live="polite">
            {shown}
          </output>
          <div className="sx-calcpad">
            <button className="key" onClick={clear}>
              C
            </button>
            <button className="key" onClick={sign}>
              ±
            </button>
            <button className="key" onClick={() => setShown((s) => (s.length > 1 ? s.slice(0, -1) : "0"))}>
              ⌫
            </button>
            <button className="key" onClick={() => operate("÷")} aria-pressed={op === "÷"}>
              ÷
            </button>

            {["7", "8", "9"].map((d) => (
              <button className="key" key={d} onClick={() => digit(d)}>
                {d}
              </button>
            ))}
            <button className="key" onClick={() => operate("×")} aria-pressed={op === "×"}>
              ×
            </button>

            {["4", "5", "6"].map((d) => (
              <button className="key" key={d} onClick={() => digit(d)}>
                {d}
              </button>
            ))}
            <button className="key" onClick={() => operate("−")} aria-pressed={op === "−"}>
              −
            </button>

            {["1", "2", "3"].map((d) => (
              <button className="key" key={d} onClick={() => digit(d)}>
                {d}
              </button>
            ))}
            <button className="key" onClick={() => operate("+")} aria-pressed={op === "+"}>
              +
            </button>

            <button className="key sx-calcwide" onClick={() => digit("0")}>
              0
            </button>
            <button className="key" onClick={() => digit(".")}>
              .
            </button>
            <button className="key" onClick={equals}>
              =
            </button>
          </div>
          <p className="sx-calcnote">
            One step at a time, like the plastic ones — 2 + 3 × 4 comes out as 20.
          </p>
        </div>
      </div>
    </details>
  );
}
