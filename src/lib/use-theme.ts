"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  DEFAULT_THEME,
  DEFAULT_WAY,
  STORAGE_KEY,
  themeByName,
  tokensFor,
  type Choice,
  type Mode,
} from "./themes";

/**
 * Reading and changing the cosmetic theme.
 *
 * The *initial* application is not done here — a blocking script in <head> does
 * that before the first paint, because anything running after hydration paints
 * the default theme first and then flips. This hook covers what comes after:
 * reflecting the stored choice in the switcher, and applying a new one.
 *
 * The stored choice is an external store, so it is read with
 * `useSyncExternalStore` rather than copied into state by an effect. That is
 * not just idiomatic: it keeps two switchers on one page in step, and picks up
 * the `storage` event so changing the theme in one tab changes it in the
 * others.
 */

const DEFAULT: Choice = { theme: DEFAULT_THEME, way: DEFAULT_WAY, mode: "auto" };

const prefersDark = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia &&
  window.matchMedia("(prefers-color-scheme: dark)").matches;

export const resolveMode = (choice: Choice): Mode =>
  choice.mode === "auto" ? (prefersDark() ? "dark" : "light") : choice.mode;

function parse(raw: string | null): Choice {
  if (!raw) return DEFAULT;
  try {
    const p = JSON.parse(raw) as Partial<Choice>;
    return {
      theme: typeof p.theme === "string" ? p.theme : DEFAULT.theme,
      way: typeof p.way === "string" ? p.way : DEFAULT.way,
      mode: p.mode === "light" || p.mode === "dark" || p.mode === "auto" ? p.mode : "auto",
    };
  } catch {
    return DEFAULT;
  }
}

/**
 * The snapshot must be referentially stable while the underlying string is
 * unchanged, or `useSyncExternalStore` re-renders forever.
 */
let cachedRaw: string | null | undefined;
let cachedChoice: Choice = DEFAULT;

function getSnapshot(): Choice {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    raw = null; // private mode
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedChoice = parse(raw);
  }
  return cachedChoice;
}

/** The server has no storage, and the blocking script has not run yet either. */
const getServerSnapshot = (): Choice => DEFAULT;

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function applyTheme(choice: Choice) {
  const mode = resolveMode(choice);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(tokensFor(choice, mode))) {
    root.style.setProperty(k, v);
  }
  root.setAttribute("data-mode", mode);
  root.setAttribute("data-theme-name", themeByName(choice.theme).name);
}

export function useTheme() {
  const choice = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setChoice = useCallback((next: Choice) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* private mode — it still applies, it just will not be remembered */
    }
    applyTheme(next);
    for (const l of listeners) l();
  }, []);

  /* While the mode is "auto" the OS is in charge, and it can change under us. */
  useEffect(() => {
    if (choice.mode !== "auto" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(choice);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [choice]);

  return { choice, setChoice, resolved: resolveMode(choice) };
}
