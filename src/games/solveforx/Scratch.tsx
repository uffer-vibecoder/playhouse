"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** The sheet's display face, so a copied equation matches the question. */
const DISPLAY = "Fredoka, system-ui, sans-serif";

/**
 * Somewhere to do the working.
 *
 * Multi-step equations are not meant to be held in the head, and the reference
 * worksheets leave white space beside every question for exactly this. A canvas
 * is the honest equivalent: you write on it the way you would write on paper.
 *
 * **Nothing here is saved, deliberately.** A drawing is tens of kilobytes where
 * every other save on this site is a few hundred bytes, and it would dwarf the
 * answers it was helping to find. Working out is not the answer — it is what
 * you throw away once you have one.
 *
 * Pointer events rather than mouse and touch separately, so finger, stylus and
 * trackpad are one code path and pressure comes free where the hardware has it.
 */
type Item =
  | { kind: "stroke"; points: { x: number; y: number }[] }
  | { kind: "stamp"; text: string; y: number };

export default function Scratch({ problem }: { problem?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  /**
   * What is on the paper, in order.
   *
   * A stroke is a list of points; a stamp is the equation copied across. They
   * share one list so undo works the same on both — copying the problem and
   * then changing your mind is the same gesture as drawing a line you did not
   * want.
   */
  const items = useRef<Item[]>([]);
  const [count, setCount] = useState(0);
  /**
   * Folded away by default, like the calculator beneath it.
   *
   * A 300px canvas sitting open under every set pushes the tools off a phone
   * screen whether or not anyone wanted to write anything. Opening it is one
   * tap, and the summary says what is on it so a fold does not hide work.
   */
  const [open, setOpen] = useState(false);

  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const ratio = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / ratio, canvas.height / ratio);
    ctx.lineWidth = 1.8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const item of items.current) {
      if (item.kind === "stamp") {
        // the equation in the sheet's own display face, so the copy looks like
        // the question rather than like a caption
        ctx.fillStyle = "#111111";
        ctx.font = `600 19px ${DISPLAY}`;
        ctx.fillText(item.text, 14, item.y);
        continue;
      }
      const stroke = item.points;
      // the ink, taken from the sheet rather than the theme: this is paper
      ctx.strokeStyle = "#111111";
      if (stroke.length === 1) {
        // a single tap is a dot, and losing it would feel like a dropped input
        ctx.beginPath();
        ctx.arc(stroke[0].x, stroke[0].y, 1, 0, Math.PI * 2);
        ctx.fillStyle = "#111111";
        ctx.fill();
        continue;
      }
      if (stroke.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (const p of stroke.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  }, []);

  /**
   * Backing store at device resolution, CSS box at layout resolution.
   *
   * Without this the line is soft on every phone and most laptops — a canvas
   * defaults to 1 pixel per CSS pixel and then gets scaled up.
   */
  const fit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const box = canvas.getBoundingClientRect();
    canvas.width = Math.round(box.width * ratio);
    canvas.height = Math.round(box.height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    repaint();
  }, [repaint]);

  useEffect(() => {
    // `fit` again when the panel opens: a canvas inside a closed <details> has
    // no layout box, so sizing it there gives a zero-width backing store and
    // the first stroke would land nowhere.
    if (!open) return;
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [fit, open]);

  const at = (e: React.PointerEvent) => {
    const box = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  };

  const down = (e: React.PointerEvent) => {
    drawing.current = true;
    items.current.push({ kind: "stroke", points: [at(e)] });
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setCount(items.current.length);
  };

  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const last = items.current[items.current.length - 1];
    if (last?.kind !== "stroke") return;
    last.points.push(at(e));
    repaint();
  };

  const up = () => {
    drawing.current = false;
  };

  const undo = () => {
    items.current.pop();
    setCount(items.current.length);
    repaint();
  };

  const clear = () => {
    items.current = [];
    setCount(0);
    repaint();
  };

  /**
   * Put the equation you are on at the top of the paper.
   *
   * Copying it by hand is the first thing anyone does with a multi-step
   * problem, and getting a sign wrong while transcribing is a way to lose ten
   * minutes to arithmetic that was never the question. Each copy lands below
   * the last, so working two problems side by side does not overwrite one.
   */
  const copyProblem = () => {
    if (!problem) return;
    const stamps = items.current.filter((i) => i.kind === "stamp").length;
    items.current.push({ kind: "stamp", text: problem, y: 30 + stamps * 30 });
    setCount(items.current.length);
    repaint();
  };

  return (
    <details className="disclosure noprint" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>
        <span className="chev" />
        Scratch paper
        <span className="sum-note">{count ? `${count} thing${count === 1 ? "" : "s"} on it` : "not saved"}</span>
      </summary>
      <div className="disclosure-body sx-scratch">
      <canvas
        ref={canvasRef}
        className="sx-canvas"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        aria-label="Scratch paper for working out"
      />
      <div className="sx-scratchtools">
        {problem && (
          <button className="tool" onClick={copyProblem}>
            Copy equation
          </button>
        )}
        <button className="tool" onClick={undo} disabled={!count}>
          Undo
        </button>
        <button className="tool" onClick={clear} disabled={!count}>
          Clear
        </button>
        {/* the one thing worth saying, said once */}
        <span className="sx-scratchnote">not saved</span>
      </div>
      </div>
    </details>
  );
}
