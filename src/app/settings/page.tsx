import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { homeForRole } from "@/lib/roles";
import {
  SettingsClient,
  type SettingsUser,
} from "@/components/settings/SettingsClient";

export const metadata = { title: "Settings · Lyceum" };

export default async function SettingsPage() {
  const session = await auth();
  // proxy.ts also gates /settings, but narrow for types + defense in depth.
  if (!session?.user) redirect("/login?next=/settings");

  const me = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      firstName: true,
      role: true,
      headline: true,
      bio: true,
      passwordHash: true,
      emailOptOut: true,
      tutorLogOptOut: true,
      coppaConsentAt: true,
    },
  });
  if (!me) redirect("/login");

  // Build a client-safe DTO: never ship the hash, only whether one exists.
  const user: SettingsUser = {
    id: me.id,
    email: me.email,
    name: me.name,
    firstName: me.firstName,
    role: me.role,
    headline: me.headline,
    bio: me.bio,
    hasPassword: !!me.passwordHash,
    emailOptOut: me.emailOptOut,
    tutorLogOptOut: me.tutorLogOptOut,
    coppaConsentAt: me.coppaConsentAt ? me.coppaConsentAt.toISOString() : null,
  };

  return <SettingsClient user={user} homeHref={homeForRole(me.role)} />;
}
