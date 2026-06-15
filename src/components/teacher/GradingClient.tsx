"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers/_app";
import { Annot, Btn, Card, Eyebrow } from "@/components/wf/primitives";
import { trpc } from "@/lib/trpc/react";

/**
 * Free-response review surface (REQUIREMENTS R33). Lists the AI-graded
 * short-answer submissions across the teacher's courses and lets them
 * override the score. Read side is teacher.freeResponseSubmissions;
 * each override is a single optimistic mutation that refetches the list.
 */
export function GradingClient() {
  const t = useTranslations("TeacherGrading");
  const list = trpc.teacher.freeResponseSubmissions.useQuery({ limit: 50 });
  const rows = list.data ?? [];

  return (
    <div style={{ padding: "24px 28px 40px", maxWidth: 900, margin: "0 auto" }}>
      <Eyebrow>{t("eyebrow")}</Eyebrow>
      <h1 className="wf-h1" style={{ fontSize: 26, margin: "6px 0 6px" }}>
        {t("title")}
      </h1>
      <div
        style={{
          fontSize: 13,
          color: "var(--wf-body)",
          marginBottom: 18,
          lineHeight: 1.5,
        }}
      >
        {t("intro")}
      </div>

      {list.isLoading ? (
        <Card p={20}>
          <Annot>{t("loading")}</Annot>
        </Card>
      ) : rows.length === 0 ? (
        <Card p={28} style={{ textAlign: "center" }}>
          <Eyebrow>{t("emptyTitle")}</Eyebrow>
          <div
            style={{ marginTop: 8, fontSize: 13, color: "var(--wf-body)" }}
          >
            {t("emptyBody")}
          </div>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {rows.map((r) => (
            <SubmissionRow
              key={r.id}
              row={r}
              onSaved={() => list.refetch()}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Element type of the submissions list, inferred from the router output.
type Row =
  inferRouterOutputs<AppRouter>["teacher"]["freeResponseSubmissions"][number];

function SubmissionRow({
  row,
  onSaved,
}: {
  row: Row;
  onSaved: () => void;
}) {
  const t = useTranslations("TeacherGrading");
  const [score, setScore] = useState<string>(
    row.scoreOverride != null ? String(row.scoreOverride) : ""
  );
  const override = trpc.teacher.overrideFreeResponse.useMutation({
    onSuccess: onSaved,
  });

  const parsed = score.trim() === "" ? null : parseInt(score, 10);
  const valid =
    parsed === null || (Number.isFinite(parsed) && parsed >= 0 && parsed <= 100);
  const finalColor =
    row.finalScore >= 80
      ? "var(--wf-good)"
      : row.finalScore >= 60
        ? "var(--wf-warn)"
        : "var(--wf-accent)";

  return (
    <Card p={16}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
          marginBottom: 8,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {row.studentName}
          </div>
          <div
            className="wf-mono"
            style={{ fontSize: 10, color: "var(--wf-mute)", marginTop: 2 }}
          >
            {row.courseTitle} · {row.lessonTitle}
            {row.reviewed ? ` · ${t("reviewed")}` : ""}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <span
            className="wf-serif"
            style={{ fontSize: 22, fontWeight: 700, color: finalColor }}
          >
            {row.finalScore}
          </span>
          <span style={{ fontSize: 12, color: "var(--wf-mute)" }}>/100</span>
          {row.scoreOverride != null && (
            <div
              className="wf-mono"
              style={{ fontSize: 9, color: "var(--wf-mute)" }}
            >
              {t("aiSaid", { score: row.aiScore ?? "—" })}
            </div>
          )}
        </div>
      </div>

      {row.prompt && (
        <div
          style={{
            fontSize: 12,
            color: "var(--wf-mute)",
            fontStyle: "italic",
            marginBottom: 6,
          }}
        >
          {row.prompt}
        </div>
      )}
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.6,
          padding: "10px 12px",
          background: "var(--wf-fillsoft)",
          border: "1px solid var(--wf-hairline)",
          borderRadius: 4,
          whiteSpace: "pre-wrap",
        }}
      >
        {row.answer}
      </div>
      {row.aiFeedback && (
        <div
          style={{
            marginTop: 6,
            fontSize: 12,
            color: "var(--wf-body)",
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
          }}
        >
          <span className="wf-mono" style={{ color: "var(--wf-ai)" }}>
            {t("aiPrefix")} ·{" "}
          </span>
          {row.aiFeedback}
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 10,
        }}
      >
        <label style={{ fontSize: 11, color: "var(--wf-mute)" }}>
          {t("overrideLabel")}
        </label>
        <input
          type="number"
          min={0}
          max={100}
          value={score}
          onChange={(e) => setScore(e.target.value)}
          placeholder={row.aiScore != null ? String(row.aiScore) : "0–100"}
          style={{
            width: 72,
            fontSize: 13,
            padding: "5px 8px",
            border: "1px solid var(--wf-hairline)",
            borderRadius: 4,
            background: "white",
          }}
        />
        <Btn
          sm
          variant="primary"
          disabled={!valid || override.isPending}
          onClick={() =>
            override.mutate({ attemptId: row.id, score: parsed })
          }
        >
          {override.isPending ? t("saving") : t("save")}
        </Btn>
        {row.scoreOverride != null && (
          <Btn
            sm
            variant="ghost"
            disabled={override.isPending}
            onClick={() => {
              setScore("");
              override.mutate({ attemptId: row.id, score: null });
            }}
          >
            {t("clear")}
          </Btn>
        )}
        {override.error && (
          <span style={{ fontSize: 11, color: "var(--wf-accent)" }}>
            {override.error.message}
          </span>
        )}
      </div>
    </Card>
  );
}
