"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Btn, Icon } from "@/components/wf/primitives";
import { trpc } from "@/lib/trpc/react";

const ICON_FOR_KIND: Record<string, "bell" | "trophy" | "sparkles" | "book"> = {
  badge_earned: "trophy",
  ai_tip: "sparkles",
  assignment_due: "book",
};

function timeAgo(date: Date): string {
  const ms = Date.now() - date.getTime();
  const m = Math.round(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return `${d}d`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const utils = trpc.useUtils();
  const { data } = trpc.notification.list.useQuery(
    { limit: 8 },
    { refetchOnWindowFocus: true, staleTime: 30_000 }
  );
  const markRead = trpc.notification.markRead.useMutation({
    onSuccess: () => utils.notification.list.invalidate(),
  });
  const markAll = trpc.notification.markAllRead.useMutation({
    onSuccess: () => utils.notification.list.invalidate(),
  });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  const unread = data?.unreadCount ?? 0;
  const items = data?.items ?? [];

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications (${unread} unread)`}
        style={{
          background: "transparent",
          border: "none",
          padding: 4,
          cursor: "pointer",
          position: "relative",
          color: "var(--wf-body)",
        }}
      >
        <Icon name="bell" size={18} color="currentColor" />
        {unread > 0 && (
          <span
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              minWidth: 14,
              height: 14,
              padding: "0 3px",
              borderRadius: 7,
              background: "var(--wf-accent)",
              color: "white",
              fontSize: 9,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-mono-stack)",
              border: "1.5px solid var(--wf-bg)",
              boxSizing: "border-box",
            }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 360,
            maxHeight: 480,
            background: "white",
            border: "1px solid var(--wf-hairline)",
            borderRadius: 6,
            boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
            zIndex: 30,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              padding: "12px 14px",
              borderBottom: "1px solid var(--wf-hairline)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <h3
              style={{
                fontSize: 13,
                margin: 0,
                fontWeight: 600,
                flex: 1,
              }}
            >
              Notifications
            </h3>
            {unread > 0 && (
              <Btn
                sm
                variant="ghost"
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
              >
                Mark all read
              </Btn>
            )}
          </div>
          <div
            style={{
              flex: 1,
              overflowY: "auto",
            }}
          >
            {items.length === 0 ? (
              <div
                style={{
                  padding: 24,
                  textAlign: "center",
                  fontSize: 12,
                  color: "var(--wf-mute)",
                }}
              >
                You&apos;re all caught up.
              </div>
            ) : (
              items.map((n, i) => {
                const Wrapper: React.ElementType = n.href ? Link : "div";
                const wrapperProps = n.href
                  ? { href: n.href }
                  : {};
                return (
                  <Wrapper
                    key={n.id}
                    {...wrapperProps}
                    onClick={() => {
                      if (!n.readAt) markRead.mutate({ id: n.id });
                      setOpen(false);
                    }}
                    style={{
                      display: "flex",
                      gap: 10,
                      padding: "12px 14px",
                      borderBottom:
                        i < items.length - 1
                          ? "1px solid var(--wf-hairline)"
                          : "none",
                      background: n.readAt ? "white" : "var(--wf-fillsoft)",
                      textDecoration: "none",
                      color: "inherit",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: "var(--wf-fill)",
                        border: "1px solid var(--wf-hairline)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Icon
                        name={ICON_FOR_KIND[n.kind] ?? "bell"}
                        size={14}
                        color={
                          n.kind === "ai_tip"
                            ? "var(--wf-ai)"
                            : "var(--wf-body)"
                        }
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: n.readAt ? 500 : 600,
                        }}
                      >
                        {n.title}
                      </div>
                      {n.body && (
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--wf-mute)",
                            marginTop: 2,
                            lineHeight: 1.4,
                          }}
                        >
                          {n.body}
                        </div>
                      )}
                      <div
                        className="wf-mono"
                        style={{
                          fontSize: 9,
                          color: "var(--wf-mute)",
                          marginTop: 4,
                          letterSpacing: "0.05em",
                        }}
                      >
                        {timeAgo(new Date(n.createdAt))}
                      </div>
                    </div>
                    {!n.readAt && (
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: "var(--wf-accent)",
                          marginTop: 6,
                          flexShrink: 0,
                        }}
                      />
                    )}
                  </Wrapper>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
