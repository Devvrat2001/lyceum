"use client";

import { useRef, useState } from "react";

/**
 * "Save offline" control for an enrolled course (REQUIREMENTS R22).
 * Posts the course's lesson URLs to the service worker over a
 * MessageChannel; the SW fetches each reader page into its runtime
 * cache (the same store its navigate handler serves from offline) and
 * streams progress back. Production-only by nature — the SW is only
 * registered on prod builds, so in dev the ready() race times out into
 * a friendly error.
 *
 * Rendered inside the library card's <Link>, so the click handler
 * preventDefaults to keep the card navigation out of it.
 */
type SaveState =
  | { kind: "idle" }
  | { kind: "saving"; done: number; total: number }
  | { kind: "done"; done: number; failed: number }
  | { kind: "error"; msg: string };

export function SaveCourseOffline({ lessonSlugs }: { lessonSlugs: string[] }) {
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  // One-shot watchdog: if the SW never answers (not registered,
  // killed, old version without the handler), fail with guidance
  // instead of spinning forever. Cleared on the first message.
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (lessonSlugs.length === 0) return null;

  const start = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (state.kind === "saving") return;

    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      setState({ kind: "error", msg: "Not supported in this browser" });
      return;
    }
    setState({ kind: "saving", done: 0, total: lessonSlugs.length });
    try {
      // `ready` never resolves when no SW is registered (dev builds) —
      // race it so the button degrades with an explanation.
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
      ]);
      const worker = reg?.active;
      if (!worker) {
        setState({
          kind: "error",
          msg: "Offline saving works in the installed app (production)",
        });
        return;
      }

      const urls = lessonSlugs.map((s) => `/student/lesson/${s}`);
      const channel = new MessageChannel();
      channel.port1.onmessage = (msg) => {
        if (watchdog.current) {
          clearTimeout(watchdog.current);
          watchdog.current = null;
        }
        const d = msg.data;
        if (d?.type === "PRECACHE_PROGRESS") {
          setState({ kind: "saving", done: d.done + d.failed, total: d.total });
        } else if (d?.type === "PRECACHE_DONE") {
          setState({ kind: "done", done: d.done, failed: d.failed });
        }
      };
      watchdog.current = setTimeout(() => {
        setState({
          kind: "error",
          msg: "No response — try reloading the app",
        });
      }, 15_000);
      worker.postMessage({ type: "PRECACHE_LESSONS", urls }, [channel.port2]);
    } catch {
      setState({ kind: "error", msg: "Couldn't reach the offline store" });
    }
  };

  const label =
    state.kind === "saving"
      ? `Saving ${state.done}/${state.total}…`
      : state.kind === "done"
        ? state.failed > 0
          ? `✓ ${state.done} saved · ${state.failed} skipped`
          : "✓ Available offline"
        : state.kind === "error"
          ? state.msg
          : "Save offline";

  return (
    <button
      type="button"
      onClick={start}
      title="Download this course's lessons for offline reading"
      className="wf-mono"
      style={{
        background: "transparent",
        border: "none",
        padding: 0,
        fontSize: 9,
        letterSpacing: "0.05em",
        cursor: state.kind === "saving" ? "wait" : "pointer",
        color:
          state.kind === "done"
            ? "var(--wf-good)"
            : state.kind === "error"
              ? "var(--wf-accent)"
              : "var(--wf-mute)",
        textTransform: "uppercase",
      }}
    >
      {label}
    </button>
  );
}
