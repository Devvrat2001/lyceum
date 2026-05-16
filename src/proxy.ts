import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

// Edge-safe Auth.js client — slim config (no Prisma, no DB lookups).
// The full config in src/lib/auth.ts handles sign-in / session writes.
const { auth } = NextAuth(authConfig);

/**
 * Role-gated middleware.
 *
 * - /student/*  →  any signed-in STUDENT or ADMIN
 * - /teacher/* →  any signed-in TEACHER or ADMIN
 * - /admin/*   →  any signed-in ADMIN only
 *
 * Public: /, /login, /course/*, /api/* (auth handlers etc.)
 */
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;
  const role = session?.user?.role;

  const requiresAuth =
    pathname.startsWith("/student") ||
    pathname.startsWith("/teacher") ||
    pathname.startsWith("/admin");

  if (!requiresAuth) return NextResponse.next();

  if (!session?.user) {
    const url = new URL("/login", req.nextUrl);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const allowed =
    (pathname.startsWith("/student") &&
      (role === "STUDENT" || role === "ADMIN")) ||
    (pathname.startsWith("/teacher") &&
      (role === "TEACHER" || role === "ADMIN")) ||
    (pathname.startsWith("/admin") && role === "ADMIN");

  if (!allowed) {
    const url = new URL("/login", req.nextUrl);
    url.searchParams.set("error", "ForbiddenForRole");
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  // Skip static assets, favicon, and the Auth.js handlers themselves.
  matcher: ["/((?!_next|api/auth|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico)).*)"],
};
