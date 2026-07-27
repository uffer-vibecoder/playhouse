"use client";

/**
 * Print with every folded panel open.
 *
 * The code key lives in a <details>, and a reader who folds it away loses it
 * from the printed sheet entirely. That was the reported bug: printed from a
 * phone, no key on the page.
 *
 * This cannot be fixed in the print stylesheet, which is the obvious first
 * attempt and the reason this file exists. A closed <details> does not merely
 * render its content as hidden — the browser never assigns it to a slot in the
 * element's shadow tree, so there is nothing for CSS to reveal. Measured in
 * Chrome: with `display:block !important; content-visibility:visible !important`
 * applied to the body of a collapsed panel, `checkVisibility()` still returns
 * false. The panels have to be opened in the DOM.
 *
 * `beforeprint` covers Ctrl-P in Chrome and Firefox. It does not fire in Safari
 * at all — including on iOS, which is precisely where this was reported — so
 * the in-app Print button calls `printPanelsOpen` directly rather than relying
 * on the event.
 */

const PANELS = "details.disclosure";

function openAll(): () => void {
  const panels = Array.from(document.querySelectorAll<HTMLDetailsElement>(PANELS));
  const was = panels.map((d) => d.open);
  for (const d of panels) d.open = true;

  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    panels.forEach((d, i) => (d.open = was[i]));
  };
}

/** Fold everything open, print, then put it back as the reader had it. */
export function printPanelsOpen() {
  const restore = openAll();

  const onAfter = () => {
    window.removeEventListener("afterprint", onAfter);
    restore();
  };
  window.addEventListener("afterprint", onAfter);

  window.print();

  // Safari never fires afterprint, and on iOS `print()` does not block while
  // the share sheet is up. Restoring on a timer costs nothing where afterprint
  // did its job — `restore` only runs once.
  setTimeout(onAfter, 1500);
}

/**
 * Cover the browser's own print command too. Returns a cleanup function, so it
 * is used straight from a useEffect.
 */
export function watchBrowserPrint(): () => void {
  let restore: (() => void) | null = null;

  const before = () => { restore = openAll(); };
  const after = () => { restore?.(); restore = null; };

  window.addEventListener("beforeprint", before);
  window.addEventListener("afterprint", after);
  return () => {
    window.removeEventListener("beforeprint", before);
    window.removeEventListener("afterprint", after);
    restore?.();
  };
}
