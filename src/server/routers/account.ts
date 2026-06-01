import { z } from "zod";
import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { router, protectedProcedure, TRPCError } from "../trpc";

const PASSWORD_MIN = 8;

/**
 * Self-serve account settings for the signed-in user (the /settings page).
 * Cross-role: every authenticated user owns exactly their own row, so each
 * procedure scopes writes to `ctx.user.id` — there is no id input to spoof.
 *
 * Profile name fields apply to all roles; headline/bio are teacher-only
 * (they drive the public storefront, and `teacher.updateProfile` edits the
 * same two columns from the storefront editor — kept compatible here).
 */
export const accountRouter = router({
  /**
   * Current user's settings payload. The server component reads the same
   * columns directly for first paint; this query backs client refetches
   * after a mutation. Never returns the password hash — only whether one
   * is set (seeded dev users sign in without a password).
   */
  me: protectedProcedure.query(async ({ ctx }) => {
    const u = await ctx.db.user.findUnique({
      where: { id: ctx.user.id },
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
    if (!u) throw new TRPCError({ code: "NOT_FOUND" });
    const { passwordHash, ...rest } = u;
    return { ...rest, hasPassword: !!passwordHash };
  }),

  /**
   * Edit display/first name (all roles) + headline/bio (teachers only).
   * Empty strings normalise to NULL so a cleared field doesn't persist "".
   */
  updateProfile: protectedProcedure
    .input(
      z.object({
        firstName: z.string().trim().max(80).optional(),
        name: z.string().trim().max(120).optional(),
        headline: z.string().trim().max(120).optional(),
        bio: z.string().trim().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const isTeacher =
        ctx.user.role === "TEACHER" || ctx.user.role === "ADMIN";

      const data: Prisma.UserUpdateInput = {};
      if (input.firstName !== undefined) data.firstName = input.firstName || null;
      if (input.name !== undefined) data.name = input.name || null;
      // Storefront fields are meaningless for non-teachers — ignore rather
      // than reject, so the same form payload is safe from any role.
      if (isTeacher && input.headline !== undefined) {
        data.headline = input.headline || null;
      }
      if (isTeacher && input.bio !== undefined) {
        data.bio = input.bio || null;
      }

      if (Object.keys(data).length === 0) return { ok: true as const };
      await ctx.db.user.update({ where: { id: ctx.user.id }, data });
      return { ok: true as const };
    }),

  /**
   * Change password. Requires the current password and verifies it with
   * bcrypt before writing the new hash (cost 12, same as signup). Accounts
   * with no password (dev-quick-login seed users) can't use this — the UI
   * hides the form, and the server refuses defensively.
   */
  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1).max(160),
        newPassword: z.string().min(PASSWORD_MIN).max(160),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const u = await ctx.db.user.findUnique({
        where: { id: ctx.user.id },
        select: { passwordHash: true },
      });
      if (!u?.passwordHash) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Your account signs in without a password, so there's nothing to change.",
        });
      }

      const ok = await bcrypt.compare(input.currentPassword, u.passwordHash);
      if (!ok) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Current password is incorrect.",
        });
      }
      if (input.currentPassword === input.newPassword) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "New password must be different from the current one.",
        });
      }

      const passwordHash = await bcrypt.hash(input.newPassword, 12);
      await ctx.db.user.update({
        where: { id: ctx.user.id },
        data: { passwordHash },
      });
      return { ok: true as const };
    }),

  /**
   * Email + privacy preferences. All optional so the client can PATCH a
   * single toggle. `coppaConsent` maps a boolean to the timestamp column:
   * true stamps now(), false clears it (consent withdrawn).
   */
  updatePreferences: protectedProcedure
    .input(
      z.object({
        emailOptOut: z.boolean().optional(),
        tutorLogOptOut: z.boolean().optional(),
        coppaConsent: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const data: Prisma.UserUpdateInput = {};
      if (input.emailOptOut !== undefined) data.emailOptOut = input.emailOptOut;
      if (input.tutorLogOptOut !== undefined) {
        data.tutorLogOptOut = input.tutorLogOptOut;
      }
      if (input.coppaConsent !== undefined) {
        data.coppaConsentAt = input.coppaConsent ? new Date() : null;
      }

      if (Object.keys(data).length === 0) return { ok: true as const };
      await ctx.db.user.update({ where: { id: ctx.user.id }, data });
      return { ok: true as const };
    }),
});
