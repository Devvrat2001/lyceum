import { AdminChrome } from "@/components/layouts/AdminChrome";
import { Card, Eyebrow, Annot, Icon } from "@/components/wf/primitives";
import { db } from "@/lib/db";

const KIND_LABELS: Record<string, { label: string; color: string }> = {
  "ai.tutor": { label: "AI Tutor", color: "var(--wf-ai)" },
  "ai.course_outline": { label: "AI Course Outline", color: "var(--wf-ai)" },
  "ai.regenerate_unit": { label: "AI Unit Regen", color: "var(--wf-ai)" },
  "ai.generate_questions": { label: "AI Quiz Gen", color: "var(--wf-ai)" },
  "ai.marketplace_search": { label: "AI Search", color: "var(--wf-ai)" },
  "ai.why_path": { label: "AI Why-Path", color: "var(--wf-ai)" },
  "ai.suggest_fix": { label: "AI Suggest Fix", color: "var(--wf-ai)" },
  "ai.send_nudge": { label: "AI Nudge Draft", color: "var(--wf-ai)" },
  "auth.signup": { label: "User Signup", color: "var(--wf-body)" },
  "course.publish": { label: "Course Publish", color: "var(--wf-good)" },
  "discussion.delete_comment": {
    label: "Discussion Moderation",
    color: "var(--wf-accent)",
  },
  "payment.razorpay_account_linked": {
    label: "Payout Account Linked",
    color: "var(--wf-good)",
  },
  "payment.route_transfer": {
    label: "Payout Transfer",
    color: "var(--wf-good)",
  },
  "admin.teacher_visibility": {
    label: "Teacher Visibility",
    color: "var(--wf-accent)",
  },
};

function timeAgo(d: Date): string {
  const ms = Date.now() - d.getTime();
  const m = Math.round(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.round(h / 24);
  return `${days}d`;
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const sp = await searchParams;
  const kindFilter = sp.kind;

  const [rows, totalCount, kindCounts] = await Promise.all([
    db.auditLog.findMany({
      where: kindFilter ? { kind: kindFilter } : undefined,
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.auditLog.count(),
    db.auditLog.groupBy({
      by: ["kind"],
      _count: { _all: true },
      orderBy: { _count: { kind: "desc" } },
    }),
  ]);

  // Resolve actor names in a single query.
  const actorIds = Array.from(
    new Set(rows.map((r) => r.actorId).filter(Boolean))
  ) as string[];
  const actors =
    actorIds.length === 0
      ? []
      : await db.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true, firstName: true, email: true, role: true },
        });
  const actorById = Object.fromEntries(actors.map((a) => [a.id, a]));

  return (
    <AdminChrome>
      <header
        style={{
          height: 56,
          padding: "0 24px",
          borderBottom: "1px solid var(--wf-hairline)",
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 600 }}>Audit log</span>
        <Annot>K-12 · FERPA</Annot>
        <div style={{ flex: 1 }} />
        <span
          className="wf-mono"
          style={{ fontSize: 11, color: "var(--wf-mute)" }}
        >
          {totalCount.toLocaleString()} total events · 7-year retention
        </span>
      </header>

      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "20px 28px 40px",
          display: "grid",
          gridTemplateColumns: "240px 1fr",
          gap: 20,
        }}
      >
        <aside style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Eyebrow style={{ marginBottom: 4 }}>Event kind</Eyebrow>
          <a
            href="/admin/audit"
            style={{
              padding: "8px 10px",
              borderRadius: 4,
              fontSize: 12,
              fontWeight: !kindFilter ? 600 : 500,
              background: !kindFilter ? "var(--wf-fill)" : "transparent",
              color: "var(--wf-ink)",
              textDecoration: "none",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>All</span>
            <span
              className="wf-mono"
              style={{ fontSize: 10, color: "var(--wf-mute)" }}
            >
              {totalCount}
            </span>
          </a>
          {kindCounts.map((kc) => {
            const meta = KIND_LABELS[kc.kind] ?? {
              label: kc.kind,
              color: "var(--wf-body)",
            };
            const isActive = kindFilter === kc.kind;
            return (
              <a
                key={kc.kind}
                href={`/admin/audit?kind=${encodeURIComponent(kc.kind)}`}
                style={{
                  padding: "8px 10px",
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: isActive ? 600 : 500,
                  background: isActive ? "var(--wf-fill)" : "transparent",
                  color: meta.color,
                  textDecoration: "none",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon name="dot" size={10} color={meta.color} />
                  {meta.label}
                </span>
                <span
                  className="wf-mono"
                  style={{ fontSize: 10, color: "var(--wf-mute)" }}
                >
                  {kc._count._all}
                </span>
              </a>
            );
          })}
        </aside>

        <Card p={0}>
          <div
            style={{
              padding: "12px 18px",
              borderBottom: "1px solid var(--wf-hairline)",
              display: "flex",
              alignItems: "center",
            }}
          >
            <Eyebrow>
              {kindFilter
                ? KIND_LABELS[kindFilter]?.label ?? kindFilter
                : "Recent events"}
            </Eyebrow>
            <span
              style={{
                marginLeft: "auto",
                fontSize: 11,
                color: "var(--wf-mute)",
              }}
            >
              showing {rows.length}{" "}
              {kindFilter ? `of ${kindFilter} events` : "most-recent events"}
            </span>
          </div>
          {rows.length === 0 ? (
            <div
              style={{
                padding: 28,
                textAlign: "center",
                fontSize: 13,
                color: "var(--wf-mute)",
              }}
            >
              No events recorded yet.
            </div>
          ) : (
            rows.map((r, i) => {
              const meta = KIND_LABELS[r.kind] ?? {
                label: r.kind,
                color: "var(--wf-body)",
              };
              const actor = r.actorId ? actorById[r.actorId] : null;
              return (
                <div
                  key={r.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "150px 120px 1fr 60px",
                    gap: 14,
                    padding: "10px 18px",
                    borderBottom:
                      i < rows.length - 1
                        ? "1px solid var(--wf-hairline)"
                        : "none",
                    fontSize: 12,
                    alignItems: "start",
                  }}
                >
                  <span
                    className="wf-mono"
                    style={{
                      color: meta.color,
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    {meta.label}
                  </span>
                  <span
                    style={{ color: "var(--wf-body)", fontSize: 12 }}
                    title={r.actorId ?? ""}
                  >
                    {actor
                      ? actor.name ?? actor.firstName ?? actor.email
                      : r.actorId
                      ? "[deleted user]"
                      : "system"}
                  </span>
                  <span
                    className="wf-mono"
                    style={{
                      fontSize: 10,
                      color: "var(--wf-mute)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={JSON.stringify(r.payload)}
                  >
                    {summarizePayload(r.payload)}
                  </span>
                  <span
                    className="wf-mono"
                    style={{
                      fontSize: 10,
                      color: "var(--wf-mute)",
                      textAlign: "right",
                    }}
                    title={r.createdAt.toISOString()}
                  >
                    {timeAgo(r.createdAt)} ago
                  </span>
                </div>
              );
            })
          )}
        </Card>
      </div>
    </AdminChrome>
  );
}

function summarizePayload(p: unknown): string {
  if (p === null || typeof p !== "object") return String(p ?? "");
  const obj = p as Record<string, unknown>;
  const parts: string[] = [];
  for (const k of [
    "mode",
    "added",
    "requested",
    "unitCount",
    "itemCount",
    "elapsedMs",
    "sessionId",
  ]) {
    if (k in obj) {
      const v = obj[k];
      if (k === "elapsedMs" && typeof v === "number") {
        parts.push(`${(v / 1000).toFixed(2)}s`);
      } else if (k === "sessionId" && typeof v === "string") {
        parts.push(`sess=${v.slice(-6)}`);
      } else {
        parts.push(`${k}=${v}`);
      }
    }
  }
  return parts.join(" · ");
}
