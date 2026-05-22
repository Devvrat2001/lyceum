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

/**
 * Whether `role` may access `path` — mirrors the role gate in
 * `src/proxy.ts`. Anything not under a role-gated prefix is public and
 * always accessible. (Kept in sync with proxy.ts by hand; the
 * duplication is small and proxy.ts runs on the edge runtime.)
 */
export function canRoleAccess(
  role: Role | string | null | undefined,
  path: string
): boolean {
  if (path.startsWith("/student")) {
    return role === "STUDENT" || role === "ADMIN";
  }
  if (path.startsWith("/teacher")) {
    return role === "TEACHER" || role === "ADMIN";
  }
  if (path.startsWith("/admin")) {
    return role === "ADMIN";
  }
  if (path.startsWith("/parent")) {
    return role === "PARENT" || role === "ADMIN";
  }
  return true;
}

/**
 * Resolve where to send a signed-in user, honoring an optional post-login
 * `next` ONLY when it's a same-site path the role can actually reach.
 *
 * A role-forbidden `next` (e.g. a teacher carrying `next=/student`) would
 * otherwise loop forever: redirect(next) → proxy.ts rejects →
 * /login?next=… → redirect(next) → … An off-site `next` (`//evil.com`,
 * `https://…`) is rejected too — both fall back to the role's own home.
 */
export function safeRedirect(
  role: Role | string | null | undefined,
  next: string | null | undefined
): string {
  if (
    next &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    canRoleAccess(role, next)
  ) {
    return next;
  }
  return homeForRole(role);
}
