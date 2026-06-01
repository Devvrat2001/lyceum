import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
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
 * Phase 1 dev strategy: a Credentials provider that takes an email and
 * looks up the seeded user. No password — DEV_ONLY quick-login so we can
 * demo all roles without spinning up Resend / SMTP.
 *
 * Phase 6: Google OAuth is wired below, gated on GOOGLE_CLIENT_ID/SECRET
 * (the app runs identically without them). Still TODO: Email magic-link
 * (Resend) and the K-12 rostering SSO (Clever / ClassLink) — those also
 * carry role data, so new users aren't all defaulted to STUDENT the way a
 * bare Google sign-in is.
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
    // Google OAuth — registered only when both creds exist, so the app
    // behaves identically without them (the login button is hidden too).
    // `allowDangerousEmailAccountLinking` is safe here because Google
    // verifies email ownership: a teacher who signed up with a password
    // and later clicks "Continue with Google" links to the same account
    // (and keeps their role) instead of hitting OAuthAccountNotLinked.
    // Brand-new Google users are created with the schema-default STUDENT
    // role; an admin upgrades teachers/admins (role-carrying SSO is a
    // later step — see the header TODO).
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? [
          Google({
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        // Credentials returns {role}; the Prisma adapter (OAuth) returns the
        // full User row, which also has `role` (default STUDENT for a brand
        // new Google user). Either way we stamp it onto the JWT.
        token.role = (user as { role?: Role }).role ?? "STUDENT";
      }
      return token;
    },
  },
});

/**
 * Whether Google OAuth is configured. The login page reads this to decide
 * whether to render the "Continue with Google" button — mirrors the lazy
 * gating used for Stripe / Mux / Resend, so the feature is dormant (not
 * broken) until the credentials are added.
 */
export function isGoogleAuthEnabled(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}
