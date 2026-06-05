"use client";
import { useEffect } from "react";
import { flushQueuedAttempts } from "@/lib/offline/attemptStore";

/**
 * Mounts in the student chrome and replays any offline-queued attempts when
 * connectivity returns — on mount (covers "was offline, then reloaded after
 * reconnect") and on every `online` event. Renders nothing.
 */
export function OfflineSync() {
  useEffect(() => {
    const flush = () => {
      void flushQueuedAttempts();
    };
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, []);
  return null;
}
