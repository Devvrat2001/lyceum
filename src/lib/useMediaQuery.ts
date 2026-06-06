"use client";
import { useCallback, useSyncExternalStore } from "react";

/**
 * SSR-safe media-query hook. Uses `useSyncExternalStore` (not an effect +
 * setState) so it's lint-clean under the React Compiler and hydrates without a
 * mismatch: the server snapshot is always `false`, then the client resolves the
 * real match on mount.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query]
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  );
}

/** True on phone-width viewports. Default breakpoint 768px (md). */
export function useIsMobile(maxWidth = 768): boolean {
  return useMediaQuery(`(max-width: ${maxWidth - 1}px)`);
}
