"use client";
import { useState } from "react";
import { Btn, Icon } from "@/components/wf/primitives";

/**
 * Downloads the institution board report PDF from /api/admin/board-report.
 * Uses a fetch→blob→anchor click (rather than a bare link) so we can show a
 * generating state and surface a failure instead of navigating away.
 */
export function BoardReportButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function download() {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const res = await fetch("/api/admin/board-report");
      if (!res.ok) {
        setError(true);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "board-report.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Btn
      variant="ghost"
      sm
      icon={<Icon name="download" size={12} />}
      onClick={download}
      disabled={busy}
      title={error ? "Couldn't generate the report — try again." : undefined}
    >
      {busy ? "Generating…" : error ? "Retry report" : "Board report"}
    </Btn>
  );
}
