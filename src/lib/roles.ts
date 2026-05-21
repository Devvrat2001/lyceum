import type { Role } from "@prisma/client";

/**
 * Where each role lands after signing in. Single source of truth so the
 * login form, the login page's already-signed-in redirect, and the dev
 * quick-login buttons can't drift apart.
 *
 * Keep these paths in sync with the role gate in `src/proxy.ts`: sending
 * a role to a path its own middleware rejects causes an infinite
 * redirect loop (land → forbidden → /login → land → …). That is exactly
 * what happened when every role defaulted to `/student`.
 */
const ROLE_HOME: Record<Role, string> = {
  STUDENT: "/student",
  TEACHER: "/teacher",
  ADMIN: "/admin",
  PARENT: "/parent",
};

/**
 * Resolve the post-login landing path for a role. An unknown or missing
 * role falls back to the student dashboard — the same default the public
 * surfaces use for a not-yet-roled visitor.
 *
 * This module is intentionally dependency-free (only a type import, which
 * is erased) so it is safe to import from client components.
 */
export function homeForRole(role: Role | string | null | undefined): string {
  if (typeof role === "string" && role in ROLE_HOME) {
    return ROLE_HOME[role as Role];
  }
  return "/student";
}
