import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AdminChrome } from "@/components/layouts/AdminChrome";
import {
  Avatar,
  Btn,
  Card,
  Eyebrow,
  Icon,
} from "@/components/wf/primitives";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { ParentLinksManager } from "@/components/admin/ParentLinksManager";

export default async function AdminPeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const session = await auth();
  const me = await db.user.findUnique({
    where: { id: session!.user.id },
    select: { institutionId: true },
  });
  const institutionId =
    me?.institutionId ??
    (await db.institution.findFirst({ select: { id: true } }))?.id;
  const { role: roleFilter } = await searchParams;

  const users = await db.user.findMany({
    where: {
      institutionId,
      ...(roleFilter ? { role: roleFilter as "STUDENT" } : {}),
    },
    orderBy: [{ role: "asc" }, { email: "asc" }],
    include: {
      class: { select: { name: true } },
      _count: {
        select: {
          enrollments: true,
          authoredCourses: true,
          childLinks: true,
        },
      },
    },
  });

  const counts = {
    STUDENT: users.filter((u) => u.role === "STUDENT").length,
    TEACHER: users.filter((u) => u.role === "TEACHER").length,
    ADMIN: users.filter((u) => u.role === "ADMIN").length,
    PARENT: users.filter((u) => u.role === "PARENT").length,
  };

  const t = await getTranslations("AdminPeople");
  // Role labels (singular for chips/rows, plural for the group eyebrow).
  const roleLabel: Record<string, string> = {
    STUDENT: t("roleStudent"),
    TEACHER: t("roleTeacher"),
    ADMIN: t("roleAdmin"),
    PARENT: t("roleParent"),
  };
  const groupLabel: Record<string, string> = {
    STUDENT: t("groupStudent"),
    TEACHER: t("groupTeacher"),
    ADMIN: t("groupAdmin"),
    PARENT: t("groupParent"),
  };

  return (
    <AdminChrome active="people">
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
        <div style={{ display: "flex", gap: 6, marginLeft: 8 }}>
          {(["STUDENT", "TEACHER", "ADMIN", "PARENT"] as const).map(
            (r) => (
              <Link
                key={r}
                href={`/admin/people${
                  r === roleFilter ? "" : `?role=${r}`
                }`}
                style={{ textDecoration: "none" }}
              >
                <span
                  className="wf-chip"
                  style={{
                    background:
                      r === roleFilter ? "var(--wf-ink)" : "white",
                    color: r === roleFilter ? "white" : "var(--wf-body)",
                    borderColor:
                      r === roleFilter ? "var(--wf-ink)" : "var(--wf-hairline)",
                  }}
                >
                  {roleLabel[r]} · {counts[r]}
                </span>
              </Link>
            )
          )}
        </div>
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" sm icon={<Icon name="download" size={12} />}>
          {t("exportCsv")}
        </Btn>
        <Btn
          variant="primary"
          sm
          icon={<Icon name="plus" size={12} color="white" />}
        >
          {t("invite")}
        </Btn>
      </header>

      <div style={{ flex: 1, overflow: "auto", padding: "20px 28px 40px" }}>
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
              {roleFilter ? groupLabel[roleFilter] : t("everyone")}
            </Eyebrow>
            <span
              style={{
                marginLeft: "auto",
                fontSize: 11,
                color: "var(--wf-mute)",
              }}
            >
              {t("ofTotal", {
                shown: users.length,
                total: Object.values(counts).reduce((a, b) => a + b, 0),
              })}
            </span>
          </div>
          {users.length === 0 ? (
            <div
              style={{
                padding: 28,
                textAlign: "center",
                fontSize: 13,
                color: "var(--wf-mute)",
              }}
            >
              {t("empty")}
            </div>
          ) : (
            users.map((u, i) => (
              <div
                key={u.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "12px 18px",
                  borderBottom:
                    i < users.length - 1
                      ? "1px solid var(--wf-hairline)"
                      : "none",
                  flexWrap: "wrap",
                }}
              >
                <Avatar
                  initials={(u.name ?? u.email)
                    .split(" ")
                    .map((x) => x[0])
                    .join("")
                    .slice(0, 2)}
                  size={32}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {u.name ?? u.firstName ?? "—"}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--wf-mute)",
                      marginTop: 2,
                    }}
                  >
                    {u.email}
                    {u.class?.name
                      ? ` · ${t("rowClass", { name: u.class.name })}`
                      : ""}
                  </div>
                </div>
                <span
                  className="wf-chip"
                  style={{ borderColor: "var(--wf-hairline)" }}
                >
                  {roleLabel[u.role]}
                </span>
                <span
                  className="wf-mono"
                  style={{
                    fontSize: 10,
                    color: "var(--wf-mute)",
                    minWidth: 90,
                    textAlign: "right",
                  }}
                >
                  {u.role === "STUDENT"
                    ? t("countCourses", { count: u._count.enrollments })
                    : u.role === "TEACHER"
                    ? t("countCourses", { count: u._count.authoredCourses })
                    : u.role === "PARENT"
                    ? t("countChildren", { count: u._count.childLinks })
                    : "—"}
                </span>
                {u.role === "PARENT" && (
                  <ParentLinksManager parentId={u.id} />
                )}
              </div>
            ))
          )}
        </Card>
      </div>
    </AdminChrome>
  );
}
