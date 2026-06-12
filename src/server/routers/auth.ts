import { randomBytes } from "node:crypto";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../trpc";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";
import { checkAIQuota } from "@/lib/rateLimit";
import {
  isEmailEnabled,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "@/lib/email";

const PASSWORD_MIN = 8;
/** Reset links work for 1 hour; verification links for 24. */
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** Namespaced VerificationToken identifiers — the Auth.js table is a
 *  generic (identifier, token) store, so the prefix keeps our two flows
 *  from ever colliding with each other or an adapter's own rows. */
const resetIdentifier = (email: string) => `pwreset:${email}`;
const verifyIdentifier = (email: string) => `verify:${email}`;

export const authRouter = router({
  signup: publicProcedure
    .input(
      z.object({
        email: z.string().email().max(160),
        password: z.string().min(PASSWORD_MIN).max(160),
        firstName: z.string().min(1).max(80).optional(),
        // Phase 1 keeps signup limited to STUDENT and TEACHER. Admin/Parent
        // are provisioned by an admin (Phase 4: invite flow).
        role: z.enum(["STUDENT", "TEACHER"]).default("STUDENT"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const email = input.email.trim().toLowerCase();

      const existing = await ctx.db.user.findUnique({ where: { email } });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An account with that email already exists.",
        });
      }

      const passwordHash = await bcrypt.hash(input.password, 12);

      const user = await ctx.db.user.create({
        data: {
          email,
          passwordHash,
          firstName: input.firstName ?? null,
          name: input.firstName ?? email.split("@")[0],
          role: input.role,
        },
        select: { id: true, email: true, name: true, role: true },
      });

      // Email verification (R10) — best-effort: signup must never fail
      // on mail problems, and it's a no-op while email is dormant.
      if (isEmailEnabled()) {
        try {
          const token = randomBytes(32).toString("hex");
          await ctx.db.verificationToken.create({
            data: {
              identifier: verifyIdentifier(email),
              token,
              expires: new Date(Date.now() + VERIFY_TOKEN_TTL_MS),
            },
          });
          await sendVerificationEmail({
            to: email,
            firstName: user.name ?? "there",
            verifyUrl: `${env.PUBLIC_BASE_URL}/verify-email?token=${token}&email=${encodeURIComponent(email)}`,
          });
        } catch (err) {
          console.error("[auth.signup] verification email failed", err);
        }
      }

      return user;
    }),

  /**
   * Start a password reset (R10). ALWAYS answers `{ ok: true }` in the
   * same shape and time profile whether or not the email exists — the
   * response must never confirm which addresses have accounts. The
   * actual link only travels by email. Rate-limited per anonymous
   * caller via the audit-row counter (kind-scoped so it doesn't share a
   * bucket with AI usage).
   */
  requestPasswordReset: publicProcedure
    .input(z.object({ email: z.string().email().max(160) }))
    .mutation(async ({ ctx, input }) => {
      await checkAIQuota({
        actorId: null,
        anonKey: ctx.anonKey ?? null,
        kind: "auth.password_reset_request",
      });
      const email = input.email.trim().toLowerCase();
      const user = await ctx.db.user.findUnique({
        where: { email },
        select: { id: true, name: true, firstName: true },
      });

      if (user) {
        const token = randomBytes(32).toString("hex");
        // One live reset link per account — a new request invalidates
        // older ones.
        await ctx.db.verificationToken.deleteMany({
          where: { identifier: resetIdentifier(email) },
        });
        await ctx.db.verificationToken.create({
          data: {
            identifier: resetIdentifier(email),
            token,
            expires: new Date(Date.now() + RESET_TOKEN_TTL_MS),
          },
        });
        await sendPasswordResetEmail({
          to: email,
          firstName: user.firstName ?? user.name ?? "there",
          resetUrl: `${env.PUBLIC_BASE_URL}/reset-password?token=${token}&email=${encodeURIComponent(email)}`,
        });
      }

      // actorId stays null so the anonymous rate-limit bucket counts
      // every request; the email itself is deliberately NOT logged.
      await audit({
        actorId: null,
        kind: "auth.password_reset_request",
        payload: {
          found: !!user,
          ...(ctx.anonKey ? { anonKey: ctx.anonKey } : {}),
        },
      });
      return { ok: true as const };
    }),

  /**
   * Finish a password reset: token + email must match an unexpired
   * VerificationToken row. On success the new bcrypt hash lands, every
   * reset token for the account is destroyed, and — since following an
   * emailed link proves ownership — the address is marked verified.
   */
  resetPassword: publicProcedure
    .input(
      z.object({
        email: z.string().email().max(160),
        token: z.string().min(16).max(128),
        password: z.string().min(PASSWORD_MIN).max(160),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const email = input.email.trim().toLowerCase();
      const identifier = resetIdentifier(email);
      const invalid = () =>
        new TRPCError({
          code: "BAD_REQUEST",
          message:
            "That reset link is invalid or has expired. Request a new one.",
        });

      const row = await ctx.db.verificationToken.findUnique({
        where: { identifier_token: { identifier, token: input.token } },
      });
      if (!row) throw invalid();
      if (row.expires.getTime() < Date.now()) {
        await ctx.db.verificationToken.deleteMany({ where: { identifier } });
        throw invalid();
      }
      const user = await ctx.db.user.findUnique({
        where: { email },
        select: { id: true, emailVerified: true },
      });
      if (!user) throw invalid();

      const passwordHash = await bcrypt.hash(input.password, 12);
      await ctx.db.$transaction([
        ctx.db.user.update({
          where: { id: user.id },
          data: {
            passwordHash,
            emailVerified: user.emailVerified ?? new Date(),
          },
        }),
        ctx.db.verificationToken.deleteMany({ where: { identifier } }),
      ]);
      await audit({
        actorId: user.id,
        kind: "auth.password_reset",
        payload: { method: "email_token" },
      });
      return { ok: true as const };
    }),

  /** Confirm an email address from the signup verification link. */
  verifyEmail: publicProcedure
    .input(
      z.object({
        email: z.string().email().max(160),
        token: z.string().min(16).max(128),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const email = input.email.trim().toLowerCase();
      const identifier = verifyIdentifier(email);
      const row = await ctx.db.verificationToken.findUnique({
        where: { identifier_token: { identifier, token: input.token } },
      });
      if (!row || row.expires.getTime() < Date.now()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "That verification link is invalid or has expired. Sign in to request a new one.",
        });
      }
      const user = await ctx.db.user.findUnique({
        where: { email },
        select: { id: true, emailVerified: true },
      });
      if (!user) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown account." });
      }
      await ctx.db.$transaction([
        ctx.db.user.update({
          where: { id: user.id },
          data: { emailVerified: user.emailVerified ?? new Date() },
        }),
        ctx.db.verificationToken.deleteMany({ where: { identifier } }),
      ]);
      await audit({
        actorId: user.id,
        kind: "auth.email_verified",
        payload: {},
      });
      return { ok: true as const };
    }),
});
