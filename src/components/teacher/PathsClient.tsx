"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/react";
import { Btn, Card, Eyebrow } from "@/components/wf/primitives";
import { formatPrice as fmtPrice } from "@/lib/currency";

/**
 * /teacher/paths — the bundle authoring surface. Until this existed the
 * homepage "Multi-course paths" strip was seed-only: there was no flow
 * anywhere to create one. Teachers pick ≥2 of their own published
 * courses (click order = path order), set a bundle price, and the card
 * appears on the marketplace homepage with an honest computed
 * "Save N%" label. Deleting a bundle never touches course enrollments.
 */
export function PathsClient() {
  const t = useTranslations("TeacherPaths");
  const utils = trpc.useUtils();
  const myPaths = trpc.path.myPaths.useQuery();
  const eligible = trpc.path.myEligibleCourses.useQuery();

  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [priceDollars, setPriceDollars] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const create = trpc.path.create.useMutation({
    onSuccess: () => {
      setTitle("");
      setSubtitle("");
      setPriceDollars("");
      setSelectedIds([]);
      utils.path.myPaths.invalidate();
    },
  });
  const remove = trpc.path.remove.useMutation({
    onSuccess: () => utils.path.myPaths.invalidate(),
  });

  const toggle = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const priceCents = Math.max(
    0,
    Math.round((Number.parseFloat(priceDollars) || 0) * 100)
  );
  const selectedSum = (eligible.data ?? [])
    .filter((c) => selectedIds.includes(c.id))
    .reduce((a, c) => a + c.priceCents, 0);
  const savePct =
    selectedSum > 0 && priceCents < selectedSum
      ? Math.round((1 - priceCents / selectedSum) * 100)
      : null;

  const canCreate =
    title.trim().length >= 3 && selectedIds.length >= 2 && !create.isPending;

  return (
    <div style={{ padding: "24px 28px 40px", maxWidth: 980 }}>
      <Eyebrow>{t("eyebrow")}</Eyebrow>
      <h1 className="wf-h1" style={{ fontSize: 26, margin: "6px 0 4px" }}>
        {t("title")}
      </h1>
      <div
        style={{
          fontSize: 13,
          color: "var(--wf-body)",
          marginBottom: 20,
          maxWidth: 560,
        }}
      >
        {t("intro")}
      </div>

      {/* Create */}
      <Card p={18} style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
          {t("newBundle")}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr) 120px",
            gap: 10,
            marginBottom: 12,
          }}
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("titlePlaceholder")}
            maxLength={120}
            style={inputStyle}
          />
          <input
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder={t("subtitlePlaceholder")}
            maxLength={160}
            style={inputStyle}
          />
          <input
            value={priceDollars}
            onChange={(e) => setPriceDollars(e.target.value)}
            placeholder={t("pricePlaceholder")}
            inputMode="decimal"
            style={inputStyle}
          />
        </div>

        <div
          style={{
            fontSize: 11,
            color: "var(--wf-mute)",
            marginBottom: 8,
          }}
        >
          {t("pickHint")}
          {savePct !== null && savePct > 0 && (
            <span style={{ color: "var(--wf-good)", marginLeft: 8 }}>
              {t("savePct", { pct: savePct })}
            </span>
          )}
        </div>

        {eligible.isLoading ? null : (eligible.data?.length ?? 0) < 2 ? (
          <div
            style={{
              fontSize: 12,
              color: "var(--wf-mute)",
              padding: "8px 0",
            }}
          >
            {t("needTwo")}
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              marginBottom: 14,
            }}
          >
            {eligible.data!.map((c) => {
              const idx = selectedIds.indexOf(c.id);
              const active = idx >= 0;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggle(c.id)}
                  className={`wf-chip${active ? " wf-chip--accent" : ""}`}
                  style={{ cursor: "pointer" }}
                >
                  {active ? `${idx + 1} · ` : ""}
                  {c.title} · {fmtPrice(c.priceCents)}
                </button>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Btn
            variant="primary"
            sm
            disabled={!canCreate}
            onClick={() =>
              create.mutate({
                title: title.trim(),
                ...(subtitle.trim() ? { subtitle: subtitle.trim() } : {}),
                priceCents,
                courseIds: selectedIds,
              })
            }
          >
            {create.isPending ? t("creating") : t("createBundle")}
          </Btn>
          {create.isError && (
            <span style={{ fontSize: 12, color: "var(--wf-accent)" }}>
              {create.error.message}
            </span>
          )}
          {create.isSuccess && !create.isPending && (
            <span style={{ fontSize: 12, color: "var(--wf-mute)" }}>
              {t("created")}
            </span>
          )}
        </div>
      </Card>

      {/* My bundles */}
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
        {t("yourBundles")}
      </div>
      {myPaths.isLoading ? null : (myPaths.data?.length ?? 0) === 0 ? (
        <Card p={22} style={{ textAlign: "center" }}>
          <Eyebrow>{t("noBundles")}</Eyebrow>
        </Card>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {myPaths.data!.map((p) => (
            <Card key={p.id} p={16}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 10,
                  marginBottom: 6,
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 600 }}>{p.title}</div>
                <span style={{ fontSize: 12, color: "var(--wf-mute)" }}>
                  {p.subtitle}
                </span>
                <span
                  className="wf-mono"
                  style={{
                    marginLeft: "auto",
                    fontSize: 10,
                    color: "var(--wf-good)",
                  }}
                >
                  {p.saveLabel ?? ""}
                </span>
                <span style={{ fontSize: 14, fontWeight: 700 }}>
                  {fmtPrice(p.priceCents)}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                {p.courses.map((pc) => (
                  <span key={pc.courseId} className="wf-chip">
                    {pc.order} · {pc.course.title}
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(t("deleteConfirm", { title: p.title }))) {
                      remove.mutate({ pathId: p.id });
                    }
                  }}
                  className="wf-mono"
                  style={{
                    marginLeft: "auto",
                    background: "transparent",
                    border: "none",
                    color: "var(--wf-accent)",
                    fontSize: 10,
                    letterSpacing: "0.06em",
                    cursor: "pointer",
                    padding: "4px 6px",
                  }}
                >
                  {t("delete")}
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  fontSize: 13,
  padding: "8px 10px",
  border: "1px solid var(--wf-hairline)",
  borderRadius: 4,
  fontFamily: "inherit",
  width: "100%",
  boxSizing: "border-box",
};
