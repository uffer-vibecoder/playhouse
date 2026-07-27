"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
export default function Scratch() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  /** Each stroke as a list of points, so undo can drop the last one exactly. */
  const strokes = useRef<{ x: number; y: number }[][]>([]);
  const [count, setCount] = useState(0);

  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const ratio = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / ratio, canvas.height / ratio);
    // the ink, taken from the sheet rather than the theme: this is paper
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = 1.8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of strokes.current) {
      if (stroke.length < 2) {
        // a single tap is a dot, and losing it would feel like a dropped input
        if (stroke.length === 1) {
          ctx.beginPath();
          ctx.arc(stroke[0].x, stroke[0].y, 1, 0, Math.PI * 2);
          ctx.fillStyle = "#111111";
          ctx.fill();
        }
        continue;
      }
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
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [fit]);

  const at = (e: React.PointerEvent) => {
    const box = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  };

  const down = (e: React.PointerEvent) => {
    drawing.current = true;
    strokes.current.push([at(e)]);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setCount(strokes.current.length);
  };

  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    strokes.current[strokes.current.length - 1].push(at(e));
    repaint();
  };

  const up = () => {
    drawing.current = false;
  };

  const undo = () => {
    strokes.current.pop();
    setCount(strokes.current.length);
    repaint();
  };

  const clear = () => {
    strokes.current = [];
    setCount(0);
    repaint();
  };

  return (
    <div className="sx-scratch noprint">
      <div className="sx-scratchhead">
        <span>Scratch paper</span>
        <span className="sx-scratchnote">not saved — it goes when you leave</span>
      </div>
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
        <button className="tool" onClick={undo} disabled={!count}>
          Undo
        </button>
        <button className="tool" onClick={clear} disabled={!count}>
          Clear
        </button>
      </div>
    </div>
  );
}
