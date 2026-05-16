import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { authConfig } from "@/lib/auth.config";

/**
 * Full Auth.js v5 config — uses Prisma + Credentials.
 * Lives in the Node runtime only.
 *
 * Phase 1 dev strategy: a single Credentials provider that takes an email
 * and looks up the seeded user. No password — DEV_ONLY quick-login so we
 * can demo all roles without spinning up Resend / SMTP.
 *
 * Production TODO: replace Credentials with Email magic-link (Resend) and/or
 * Google + Clever SSO. Search "DEV_ONLY" to find the swap point.
 */
export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(db),
  secret: env.NEXTAUTH_SECRET,
  providers: [
    Credentials({
      name: "Email + password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = (credentials?.email as string | undefined)
          ?.trim()
          .toLowerCase();
        const password = credentials?.password as string | undefined;
        if (!email) return null;

        const user = await db.user.findUnique({ where: { email } });
        if (!user) return null;

        // Real users: require bcrypt password match.
        if (user.passwordHash) {
          if (!password) return null;
          const ok = await bcrypt.compare(password, user.passwordHash);
          if (!ok) return null;
        } else {
          // Seeded demo users (no passwordHash). Only allow in dev,
          // and only when NO password was submitted — otherwise we'd
          // silently allow anyone to "sign in" with any string.
          if (env.NODE_ENV !== "development") return null;
          if (password) return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? user.firstName ?? null,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role: Role }).role;
      }
      return token;
    },
  },
});
