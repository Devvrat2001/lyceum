import { redirect } from "next/navigation";
import { TeacherChrome } from "@/components/layouts/TeacherChrome";
import { StorefrontEditor } from "@/components/teacher/StorefrontEditor";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "Storefront · Lyceum" };

export default async function TeacherStorefrontPage() {
  const session = await auth();
  // proxy.ts gates /teacher/* — a session is guaranteed, but narrow it.
  if (!session?.user) redirect("/login");

  const me = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      firstName: true,
      headline: true,
      bio: true,
    },
  });
  if (!me) redirect("/login");

  return (
    <TeacherChrome active="storefront">
      <StorefrontEditor
        teacherId={me.id}
        name={me.name ?? me.firstName ?? "Teacher"}
        headline={me.headline}
        bio={me.bio}
      />
    </TeacherChrome>
  );
}
