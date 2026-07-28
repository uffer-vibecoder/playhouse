"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A small remembered choice — which way a control is set, not what a player has
 * done.
 *
 * Read as an external store rather than copied into state by an effect, for the
 * same reasons as the theme: two of the same control on one page stay in step,
 * and a change in another tab is picked up. Unlike the theme there is no
 * blocking script, so the server and the first client render both see the
 * fallback and the stored choice arrives on hydration. That is fine for
 * something below the fold; it would not be for a page-wide colour.
 *
 * Progress and saves do NOT belong here — those go through lib/progress, which
 * knows about accounts and the cloud.
 */
export function makePref<T extends string>(key: string, fallback: T, allowed: readonly T[]) {
  /* The snapshot has to be referentially stable while the stored string is
     unchanged, or useSyncExternalStore re-renders forever. */
  let cachedRaw: string | null | undefined;
  let cached: T = fallback;

  const getSnapshot = (): T => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      raw = null; // private mode
    }
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      cached = allowed.includes(raw as T) ? (raw as T) : fallback;
    }
    return cached;
  };

  const getServerSnapshot = (): T => fallback;

  const listeners = new Set<() => void>();
  const subscribe = (onChange: () => void) => {
    listeners.add(onChange);
    window.addEventListener("storage", onChange);
    return () => {
      listeners.delete(onChange);
      window.removeEventListener("storage", onChange);
    };
  };

  return function usePref(): [T, (next: T) => void] {
    const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    const set = useCallback((next: T) => {
      try {
        localStorage.setItem(key, next);
      } catch {
        /* private mode — it still applies, it just will not be remembered */
      }
      for (const l of listeners) l();
    }, []);
    return [value, set];
  };
}
