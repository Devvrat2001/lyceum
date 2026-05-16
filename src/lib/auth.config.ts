import type { NextAuthConfig } from "next-auth";
import type { Role } from "@prisma/client";

/**
 * Edge-safe auth config (no Prisma adapter, no DB lookups).
 *
 * Used by proxy.ts so the auth check survives the Edge runtime.
 * The full config in src/lib/auth.ts extends this with the Prisma adapter
 * and the Credentials provider (which needs DB access).
 *
 * The JWT callback here doesn't hit the DB; role/id were stamped onto the
 * token at sign-in by the full config and we just preserve them.
 */
export const authConfig: NextAuthConfig = {
  pages: { signIn: "/login" },
  trustHost: true,
  session: { strategy: "jwt" },
  // No providers in the edge config — proxy never signs anyone in.
  providers: [],
  callbacks: {
    async session({ session, token }) {
      if (session.user && token) {
        session.user.id = (token.id as string | undefined) ?? "";
        session.user.role = (token.role as Role | undefined) ?? "STUDENT";
      }
      return session;
    },
  },
};
