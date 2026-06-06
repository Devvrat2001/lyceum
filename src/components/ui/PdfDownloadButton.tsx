"use client";
import { useState, type ReactNode } from "react";
import { Btn } from "@/components/wf/primitives";

/**
 * Generic "download a server-generated PDF" button. Fetches the PDF route,
 * turns the response into a blob, and triggers a download — so we can show a
 * generating/retry state and surface failures instead of navigating away on a
 * 4xx. Shared by the admin Board report and the student progress report.
 */
export function PdfDownloadButton({
  href,
  downloadName,
  label,
  icon,
  variant = "ghost",
  sm = true,
}: {
  href: string;
  downloadName: string;
  label: string;
  icon?: ReactNode;
  variant?: "default" | "primary" | "ghost";
  sm?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function download() {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const res = await fetch(href);
      if (!res.ok) {
        setError(true);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      // Surface to the UI (retry state) AND log the cause so a failed
      // report download is traceable — not just a silent red button.
      console.debug("PdfDownloadButton: download failed", err);
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Btn
      variant={variant}
      sm={sm}
      icon={icon}
      onClick={download}
      disabled={busy}
      title={error ? "Couldn't generate the PDF — try again." : undefined}
    >
      {busy ? "Generating…" : error ? "Retry" : label}
    </Btn>
  );
}
