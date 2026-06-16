"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Btn, Card } from "@/components/wf/primitives";
import { trpc } from "@/lib/trpc/react";

/**
 * Admin → Teachers: every TEACHER account in one table — real email
 * (the display name can collide; the email is the identity), course +
 * student counts, Razorpay payout-link state, and a soft hide/show
 * toggle for the public marketplace rail. This is the triage surface
 * for "two teachers with the same name" reports: the emails
 * disambiguate at a glance.
 */
export function TeachersAdminClient() {
  const t = useTranslations("AdminTeachers");
  const locale = useLocale();
  // Keep the Indian date order for the default (en) audience; let other
  // locales format in their own convention.
  const dateLocale = locale === "en" ? "en-IN" : locale;
  const utils = trpc.useUtils();
  const teachers = trpc.admin.teachers.useQuery();

  // One inline link-payout form open at a time, keyed by teacher id.
  const [linkFor, setLinkFor] = useState<string | null>(null);
  const [accId, setAccId] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const refresh = () => {
    utils.admin.teachers.invalidate();
    utils.marketplace.teachers.invalidate();
  };

  const setVisibility = trpc.admin.setTeacherVisibility.useMutation({
    onSuccess: refresh,
    onError: (e) => setErr(e.message),
  });
  const linkAccount = trpc.payment.linkRazorpayAccount.useMutation({
    onSuccess: () => {
      setLinkFor(null);
      setAccId("");
      setErr(null);
      refresh();
    },
    onError: (e) => setErr(e.message),
  });

  const accValid = /^acc_[A-Za-z0-9]+$/.test(accId.trim());

  return (
    <>
      <header
        style={{
          height: 56,
          padding: "0 24px",
          borderBottom: "1px solid var(--wf-hairline)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 600 }}>{t("title")}</span>
        {teachers.data && (
          <span className="wf-mono" style={{ fontSize: 11, color: "var(--wf-mute)" }}>
            {t("accountCount", { count: teachers.data.length })}
          </span>
        )}
      </header>

      <div style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
        <p
          style={{
            fontSize: 12,
            color: "var(--wf-mute)",
            margin: "0 0 16px",
            lineHeight: 1.5,
            maxWidth: 720,
          }}
        >
          {t("intro")}
        </p>

        {err && (
          <Card
            p={12}
            style={{ marginBottom: 14, borderColor: "var(--wf-accent)" }}
          >
            <span style={{ fontSize: 12, color: "var(--wf-accent)" }}>{err}</span>
          </Card>
        )}

        {teachers.isLoading ? (
          <div style={{ fontSize: 13, color: "var(--wf-mute)" }}>
            {t("loading")}
          </div>
        ) : !teachers.data || teachers.data.length === 0 ? (
          <Card p={24} style={{ textAlign: "center" }}>
            <span style={{ fontSize: 13, color: "var(--wf-mute)" }}>
              {t("empty")}
            </span>
          </Card>
        ) : (
          <Card p={0} style={{ overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead>
                <tr>
                  <Th>{t("colTeacher")}</Th>
                  <Th>{t("colJoined")}</Th>
                  <Th align="right">{t("colCourses")}</Th>
                  <Th align="right">{t("colStudents")}</Th>
                  <Th>{t("colPayout")}</Th>
                  <Th>{t("colMarketplace")}</Th>
                </tr>
              </thead>
              <tbody>
                {teachers.data.map((teacher) => (
                  <Row key={teacher.id}>
                    <tr>
                      <Td>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 13,
                            color: teacher.hiddenFromMarketplace
                              ? "var(--wf-mute)"
                              : "var(--wf-ink)",
                          }}
                        >
                          <Link
                            href={`/t/${teacher.id}`}
                            style={{ color: "inherit", textDecoration: "none" }}
                          >
                            {teacher.name}
                          </Link>
                        </div>
                        <div
                          className="wf-mono"
                          style={{ fontSize: 11, color: "var(--wf-mute)" }}
                        >
                          {teacher.email}
                        </div>
                      </Td>
                      <Td>
                        <span className="wf-mono" style={{ fontSize: 11, color: "var(--wf-body)" }}>
                          {teacher.createdAt.toLocaleDateString(dateLocale, {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </Td>
                      <Td align="right">
                        <span className="wf-mono" style={{ fontSize: 12 }}>
                          {teacher.publishedCourses}
                          <span style={{ color: "var(--wf-mute)" }}>
                            /{teacher.totalCourses}
                          </span>
                        </span>
                      </Td>
                      <Td align="right">
                        <span className="wf-mono" style={{ fontSize: 12 }}>
                          {teacher.studentsCount.toLocaleString()}
                        </span>
                      </Td>
                      <Td>
                        {teacher.payout ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <StatusChip status={teacher.payout.status} />
                            <button
                              type="button"
                              onClick={() => {
                                setLinkFor(linkFor === teacher.id ? null : teacher.id);
                                setAccId(teacher.payout?.externalId ?? "");
                                setErr(null);
                              }}
                              style={linkBtn}
                            >
                              {linkFor === teacher.id ? t("cancel") : t("edit")}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setLinkFor(linkFor === teacher.id ? null : teacher.id);
                              setAccId("");
                              setErr(null);
                            }}
                            style={linkBtn}
                          >
                            {linkFor === teacher.id ? t("cancel") : t("linkAccount")}
                          </button>
                        )}
                      </Td>
                      <Td>
                        <Btn
                          variant="ghost"
                          sm
                          disabled={setVisibility.isPending}
                          onClick={() =>
                            setVisibility.mutate({
                              teacherId: teacher.id,
                              hidden: !teacher.hiddenFromMarketplace,
                            })
                          }
                        >
                          {teacher.hiddenFromMarketplace ? t("unhide") : t("hide")}
                        </Btn>
                        {teacher.hiddenFromMarketplace && (
                          <span
                            className="wf-mono"
                            style={{
                              marginLeft: 8,
                              fontSize: 10,
                              color: "var(--wf-mute)",
                              letterSpacing: "0.06em",
                            }}
                          >
                            {t("hidden")}
                          </span>
                        )}
                      </Td>
                    </tr>
                    {linkFor === teacher.id && (
                      <tr>
                        <td colSpan={6} style={{ padding: "0 14px 12px" }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              flexWrap: "wrap",
                              padding: 12,
                              background: "var(--wf-paper)",
                              border: "1px solid var(--wf-hairline)",
                              borderRadius: 4,
                            }}
                          >
                            <span
                              className="wf-mono"
                              style={{ fontSize: 10, color: "var(--wf-mute)", letterSpacing: "0.06em" }}
                            >
                              {t("razorpayLinkedAccount")}
                            </span>
                            <input
                              value={accId}
                              onChange={(e) => setAccId(e.target.value)}
                              placeholder="acc_…"
                              spellCheck={false}
                              style={{
                                fontSize: 12,
                                fontFamily: "var(--font-mono)",
                                padding: "6px 10px",
                                border: "1px solid var(--wf-line)",
                                borderRadius: 4,
                                width: 240,
                              }}
                            />
                            <Btn
                              variant="primary"
                              sm
                              disabled={!accValid || linkAccount.isPending}
                              onClick={() =>
                                linkAccount.mutate({
                                  teacherId: teacher.id,
                                  accountId: accId.trim(),
                                })
                              }
                            >
                              {linkAccount.isPending ? t("linking") : t("saveLink")}
                            </Btn>
                            {accId.trim() !== "" && !accValid && (
                              <span style={{ fontSize: 11, color: "var(--wf-accent)" }}>
                                {t("accIdHint")}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Row>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </>
  );
}

/** Fragment wrapper so a teacher row + its inline form share one key. */
function Row({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "right";
}) {
  return (
    <th
      className="wf-mono"
      style={{
        textAlign: align ?? "left",
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: "0.08em",
        color: "var(--wf-mute)",
        padding: "10px 14px",
        borderBottom: "1px solid var(--wf-hairline)",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "right";
}) {
  return (
    <td
      style={{
        textAlign: align ?? "left",
        padding: "10px 14px",
        borderBottom: "1px solid var(--wf-hairline)",
        verticalAlign: "top",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </td>
  );
}

function StatusChip({ status }: { status: string }) {
  const color =
    status === "activated"
      ? "var(--wf-good)"
      : status === "suspended"
      ? "var(--wf-accent)"
      : "var(--wf-mute)";
  return (
    <span
      className="wf-mono"
      style={{
        fontSize: 10,
        letterSpacing: "0.06em",
        color,
        border: `1px solid ${color}`,
        borderRadius: 999,
        padding: "2px 8px",
        textTransform: "uppercase",
      }}
    >
      {status}
    </span>
  );
}

const linkBtn: CSSProperties = {
  fontSize: 11,
  color: "var(--wf-accent)",
  background: "transparent",
  border: "none",
  padding: 0,
  cursor: "pointer",
  textDecoration: "underline",
};
