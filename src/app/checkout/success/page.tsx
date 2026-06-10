import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Btn, Card, Eyebrow, Icon } from "@/components/wf/primitives";

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{
    courseSlug?: string;
    pathSlug?: string;
    sid?: string;
  }>;
}) {
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!sp.courseSlug && !sp.pathSlug) redirect("/student/library");

  // Single-course purchases deep-link into lesson 1; bundle purchases
  // land on the library (every course in the bundle is now enrolled).
  let title: string;
  let firstLessonSlug: string | null = null;
  if (sp.courseSlug) {
    const course = await db.course.findUnique({
      where: { slug: sp.courseSlug },
      select: {
        id: true,
        title: true,
        units: {
          orderBy: { order: "asc" },
          take: 1,
          include: { lessons: { orderBy: { order: "asc" }, take: 1 } },
        },
      },
    });
    if (!course) redirect("/student/library");
    title = course.title;
    firstLessonSlug = course.units[0]?.lessons[0]?.slug ?? null;
  } else {
    const path = await db.path.findUnique({
      where: { slug: sp.pathSlug! },
      select: { title: true },
    });
    if (!path) redirect("/student/library");
    title = `the "${path.title}" bundle`;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--wf-fillsoft)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <Card p={32} style={{ maxWidth: 520, textAlign: "center" }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "#e7f4ee",
            border: "2px solid var(--wf-good)",
            margin: "0 auto 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="check" size={28} color="var(--wf-good)" />
        </div>
        <Eyebrow>Purchase complete</Eyebrow>
        <h1 className="wf-h1" style={{ fontSize: 26, margin: "8px 0 6px" }}>
          You&apos;re enrolled.
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "var(--wf-body)",
            marginBottom: 20,
            lineHeight: 1.5,
          }}
        >
          <b>{title}</b> is now in your library. Pick up where the
          teacher recommends starting, or browse the full curriculum first.
        </p>
        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "center",
          }}
        >
          {firstLessonSlug && (
            <Link
              href={`/student/lesson/${firstLessonSlug}`}
              style={{ textDecoration: "none" }}
            >
              <Btn variant="primary">Start lesson 1 →</Btn>
            </Link>
          )}
          <Link href="/student/library" style={{ textDecoration: "none" }}>
            <Btn variant="ghost">Open library</Btn>
          </Link>
        </div>
      </Card>
    </div>
  );
}
