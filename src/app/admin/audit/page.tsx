import { getTranslations } from "next-intl/server";
import { AdminChrome } from "@/components/layouts/AdminChrome";
import { Card, Eyebrow, Annot, Icon } from "@/components/wf/primitives";
import { db } from "@/lib/db";

/** Minimal translator shape — enough to format keyed ICU strings. */
type TFn = (key: string, values?: Record<string, string | number>) => string;

/**
 * Audit event-kind → { i18n label key, accent color }. The label resolves
 * through the AdminAudit namespace at render; an unknown kind falls back to
 * showing its raw id.
 */
const KIND_META: Record<string, { labelKey: string; color: string }> = {
  "ai.tutor": { labelKey: "kind_ai_tutor", color: "var(--wf-ai)" },
  "ai.course_outline": { labelKey: "kind_ai_course_outline", color: "var(--wf-ai)" },
  "ai.regenerate_unit": { labelKey: "kind_ai_regenerate_unit", color: "var(--wf-ai)" },
  "ai.generate_questions": { labelKey: "kind_ai_generate_questions", color: "var(--wf-ai)" },
  "ai.grade_free_response": { labelKey: "kind_ai_grade_free_response", color: "var(--wf-ai)" },
  "ai.marketplace_search": { labelKey: "kind_ai_marketplace_search", color: "var(--wf-ai)" },
  "ai.why_path": { labelKey: "kind_ai_why_path", color: "var(--wf-ai)" },
  "ai.suggest_fix": { labelKey: "kind_ai_suggest_fix", color: "var(--wf-ai)" },
  "ai.send_nudge": { labelKey: "kind_ai_send_nudge", color: "var(--wf-ai)" },
  "auth.signup": { labelKey: "kind_auth_signup", color: "var(--wf-body)" },
  "auth.password_reset_request": { labelKey: "kind_auth_password_reset_request", color: "var(--wf-body)" },
  "auth.password_reset": { labelKey: "kind_auth_password_reset", color: "var(--wf-body)" },
  "auth.email_verified": { labelKey: "kind_auth_email_verified", color: "var(--wf-good)" },
  "course.publish": { labelKey: "kind_course_publish", color: "var(--wf-good)" },
  "discussion.delete_comment": { labelKey: "kind_discussion_delete_comment", color: "var(--wf-accent)" },
  "parent.self_link": { labelKey: "kind_parent_self_link", color: "var(--wf-good)" },
  "payment.razorpay_account_linked": { labelKey: "kind_payment_razorpay_account_linked", color: "var(--wf-good)" },
  "payment.route_transfer": { labelKey: "kind_payment_route_transfer", color: "var(--wf-good)" },
  "admin.teacher_visibility": { labelKey: "kind_admin_teacher_visibility", color: "var(--wf-accent)" },
};

/** Coarse relative time, localized (the bucket strings carry their own "ago"). */
function timeAgo(d: Date, t: TFn): string {
  const ms = Date.now() - d.getTime();
  const m = Math.round(ms / 60_000);
  if (m < 1) return t("justNow");
  if (m < 60) return t("minutesAgo", { m });
  const h = Math.round(m / 60);
  if (h < 24) return t("hoursAgo", { h });
  const days = Math.round(h / 24);
  return t("daysAgo", { days });
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const sp = await searchParams;
  const kindFilter = sp.kind;
  const t = await getTranslations("AdminAudit");

  // Resolve an event kind to its localized label + accent color.
  const metaFor = (kind: string) => {
    const m = KIND_META[kind];
    return {
      color: m?.color ?? "var(--wf-body)",
      label: m ? t(m.labelKey) : kind,
    };
  };

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
        <span style={{ fontSize: 16, fontWeight: 600 }}>{t("title")}</span>
        <Annot>K-12 · FERPA</Annot>
        <div style={{ flex: 1 }} />
        <span
          className="wf-mono"
          style={{ fontSize: 11, color: "var(--wf-mute)" }}
        >
          {t("totalEvents", { count: totalCount })}
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
          <Eyebrow style={{ marginBottom: 4 }}>{t("eventKind")}</Eyebrow>
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
            <span>{t("all")}</span>
            <span
              className="wf-mono"
              style={{ fontSize: 10, color: "var(--wf-mute)" }}
            >
              {totalCount}
            </span>
          </a>
          {kindCounts.map((kc) => {
            const meta = metaFor(kc.kind);
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
              {kindFilter ? metaFor(kindFilter).label : t("recentEvents")}
            </Eyebrow>
            <span
              style={{
                marginLeft: "auto",
                fontSize: 11,
                color: "var(--wf-mute)",
              }}
            >
              {kindFilter
                ? t("showingFiltered", {
                    count: rows.length,
                    kind: metaFor(kindFilter).label,
                  })
                : t("showingRecent", { count: rows.length })}
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
              {t("noEvents")}
            </div>
          ) : (
            rows.map((r, i) => {
              const meta = metaFor(r.kind);
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
                      ? t("deletedUser")
                      : t("system")}
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
                    {timeAgo(r.createdAt, t)}
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
