"use client";

import dynamic from "next/dynamic";
import { trpc } from "@/lib/trpc/react";

// Mux's adaptive player. ssr:false because it registers a custom element
// that can't render on the server. Playback needs the public playbackId
// (+ a short-lived token for signed/paid videos).
const MuxPlayer = dynamic(() => import("@mux/mux-player-react"), {
  ssr: false,
});

type MuxSettings = {
  playbackId?: string;
  status?: string;
  aspectRatio?: string;
  policy?: "public" | "signed";
};

/**
 * Canonical lesson VIDEO renderer — shared by the student reader
 * (`BlockReader`) and the teacher course builder so a teacher previews
 * EXACTLY what a student will watch. Handles three sources:
 *
 *   • uploaded Mux video (`settings.source === "mux"`) — adaptive
 *     player, with a signed-playback token minted per viewer for paid
 *     courses. The course owner/admin is authorized server-side
 *     (`lesson.videoPlaybackToken`), so it plays inside the builder too —
 *     fixing the long-standing "teacher can't preview their own upload"
 *     gap;
 *   • a pasted YouTube/Vimeo URL — sandboxed iframe embed;
 *   • anything else — a safe "open in new tab" link.
 */
export function LessonVideoPlayer({
  settings,
  blockId,
  accentColor = "#ff5b1f",
}: {
  settings: Record<string, unknown>;
  blockId: string;
  accentColor?: string;
}) {
  const caption =
    typeof settings.caption === "string" ? settings.caption.trim() : "";

  // An uploaded (Mux) video takes precedence over a pasted URL.
  if (settings.source === "mux") {
    return (
      <MuxVideo
        settings={settings}
        caption={caption}
        blockId={blockId}
        accentColor={accentColor}
      />
    );
  }

  const rawUrl = typeof settings.url === "string" ? settings.url.trim() : "";
  if (!rawUrl) {
    return <VideoHint message="Your teacher hasn't added a video URL yet." />;
  }

  const embed = toEmbedUrl(rawUrl);
  return (
    <div>
      {embed ? (
        <div
          style={{
            position: "relative",
            paddingTop: "56.25%", // 16:9
            background: "var(--wf-fill)",
            border: "1px solid var(--wf-hairline)",
            borderRadius: 4,
            overflow: "hidden",
          }}
        >
          <iframe
            src={embed}
            title="Video"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            // Sandbox the player so a compromised host can't navigate our
            // parent window. See the original notes in BlockReader: scripts +
            // same-origin for the player JS, popups for "Watch on YouTube",
            // presentation for fullscreen. NOT granted: top-navigation, forms,
            // modals.
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"
            allowFullScreen
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              border: "none",
            }}
          />
        </div>
      ) : (
        // Unknown host — link out instead of risking a broken embed.
        <a
          href={rawUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: "var(--wf-ink)",
            textDecoration: "none",
            border: "1px solid var(--wf-hairline)",
            borderRadius: 3,
            padding: "8px 12px",
            fontSize: 13,
          }}
        >
          Open video ↗
        </a>
      )}
      {caption && <VideoCaption text={caption} />}
    </div>
  );
}

function MuxVideo({
  settings,
  caption,
  blockId,
  accentColor,
}: {
  settings: Record<string, unknown>;
  caption: string;
  blockId: string;
  accentColor: string;
}) {
  const mux = (settings.mux ?? {}) as MuxSettings;
  const ready = mux.status === "ready" && !!mux.playbackId;
  const isSigned = mux.policy === "signed";

  // Signed (paid-course) videos need a short-lived token, minted per viewer
  // and gated server-side; public videos play straight from the playbackId.
  // The hook runs unconditionally (rules of hooks) but only fetches for
  // signed, ready videos.
  const tokenQuery = trpc.lesson.videoPlaybackToken.useQuery(
    { blockId },
    { enabled: ready && isSigned, retry: false, staleTime: 5 * 60_000 }
  );

  if (ready) {
    if (isSigned && tokenQuery.isLoading) {
      return <VideoHint message="Loading video…" />;
    }
    if (isSigned && (tokenQuery.isError || !tokenQuery.data?.token)) {
      return (
        <VideoHint message="This video is locked — enroll in the course to watch it." />
      );
    }
    const playbackToken = isSigned
      ? tokenQuery.data?.token ?? undefined
      : undefined;
    return (
      <div>
        <div
          style={{
            borderRadius: 4,
            overflow: "hidden",
            border: "1px solid var(--wf-hairline)",
            background: "#000",
          }}
        >
          <MuxPlayer
            playbackId={mux.playbackId}
            tokens={playbackToken ? { playback: playbackToken } : undefined}
            streamType="on-demand"
            accentColor={accentColor}
            style={{
              width: "100%",
              aspectRatio: mux.aspectRatio
                ? mux.aspectRatio.replace(":", " / ")
                : "16 / 9",
            }}
          />
        </div>
        {caption && <VideoCaption text={caption} />}
      </div>
    );
  }

  if (mux.status === "errored") {
    return (
      <VideoHint message="This video couldn't be processed. Ask your teacher to re-upload it." />
    );
  }

  // waiting / preparing — Mux is still transcoding.
  return (
    <div>
      <div
        style={{
          position: "relative",
          paddingTop: "56.25%",
          background: "var(--wf-fill)",
          border: "1px solid var(--wf-hairline)",
          borderRadius: 4,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            color: "var(--wf-mute)",
          }}
        >
          Video is processing…
        </div>
      </div>
      {caption && <VideoCaption text={caption} />}
    </div>
  );
}

function VideoCaption({ text }: { text: string }) {
  return (
    <div
      style={{
        marginTop: 10,
        fontSize: 12,
        color: "var(--wf-body)",
        lineHeight: 1.5,
      }}
    >
      {text}
    </div>
  );
}

// Matches BlockReader's EmptyBlockHint so the student reader's video
// empty/locked/loading states look identical after delegating here.
function VideoHint({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: 10,
        border: "1px dashed var(--wf-hairline)",
        borderRadius: 3,
        fontSize: 12,
        color: "var(--wf-mute)",
        lineHeight: 1.5,
      }}
    >
      {message}
    </div>
  );
}

/**
 * Convert a watch URL to its embed form for the major hosts we support.
 * Returns null when the host is unknown — caller falls back to a plain
 * link so we don't render a misleading iframe. Conservative on purpose:
 * only the patterns a teacher pastes from the address bar.
 */
function toEmbedUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");
  if (host === "youtube.com" || host === "m.youtube.com") {
    const v = u.searchParams.get("v");
    if (v) return `https://www.youtube.com/embed/${encodeURIComponent(v)}`;
  }
  if (host === "youtu.be") {
    const id = u.pathname.replace(/^\//, "");
    if (id) return `https://www.youtube.com/embed/${encodeURIComponent(id)}`;
  }
  if (host === "vimeo.com") {
    const id = u.pathname.replace(/^\//, "").split("/")[0];
    if (/^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
  }
  return null;
}
