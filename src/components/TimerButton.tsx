"use client";

import { clock, type Timer } from "@/lib/use-timer";

/**
 * The control for the optional clock.
 *
 * Reads "Time this one" until asked, which is deliberate wording: it offers
 * rather than announces, and it makes clear that not pressing it is a normal
 * way to play rather than a thing left undone.
 *
 * Once a puzzle is finished the control goes and the time stays, because
 * stopping and starting after the fact would make the number mean nothing.
 */
export default function TimerButton({ timer, solved }: { timer: Timer; solved: boolean }) {
  if (solved) {
    return timer.ms === null ? null : (
      <span className="sx-clock done" aria-label={`Finished in ${clock(timer.ms)}`}>
        {clock(timer.ms)}
      </span>
    );
  }

  if (timer.ms === null) {
    return (
      <button className="tool" onClick={timer.start}>
        Time this one
      </button>
    );
  }

  return (
    <span className="clockrow">
      <span className={"sx-clock" + (timer.running ? " ticking" : "")} role="timer">
        {clock(timer.ms)}
      </span>
      <button className="tool" onClick={timer.running ? timer.stop : timer.start}>
        {timer.running ? "Pause" : "Resume"}
      </button>
      <button className="tool" onClick={timer.reset}>
        Forget it
      </button>
    </span>
  );
}
