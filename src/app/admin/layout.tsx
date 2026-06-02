import type { CSSProperties, ReactNode } from "react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Applies the institution's brand accent across every /admin page by
 * overriding the `--wf-accent` CSS variable. A `display: contents` wrapper
 * carries the variable to descendants without creating a layout box (custom
 * properties inherit regardless of `display`), so AdminChrome's own
 * full-height layout is untouched. No override when brandColor is unset —
 * the default Lyceum accent shows through.
 */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();
  let brandColor: string | null = null;
  if (session?.user) {
    const me = await db.user.findUnique({
      where: { id: session.user.id },
      select: { institutionId: true },
    });
    const institutionId =
      me?.institutionId ??
      (await db.institution.findFirst({ select: { id: true } }))?.id ??
      null;
    if (institutionId) {
      const inst = await db.institution.findUnique({
        where: { id: institutionId },
        select: { brandColor: true },
      });
      brandColor = inst?.brandColor ?? null;
    }
  }

  if (!brandColor) return <>{children}</>;
  return (
    <div style={{ display: "contents", "--wf-accent": brandColor } as CSSProperties}>
      {children}
    </div>
  );
}
