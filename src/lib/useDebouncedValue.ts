"use client";

import { useEffect, useState } from "react";

/**
 * Trailing-edge debounce of a fast-changing value (e.g. search input →
 * network query). The setState happens inside the timer callback, never
 * synchronously in the effect body, so it's clean under the
 * react-compiler set-state-in-effect rule.
 */
export function useDebouncedValue<T>(value: T, ms = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
