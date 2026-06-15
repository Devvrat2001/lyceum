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

  /**
   * Data portability (R43, DPDP/COPPA right-to-access). Returns a JSON
   * bundle of everything tied to the signed-in user — profile, progress,
   * gamification ledger, reviews, notifications, and orders — so the
   * /settings page can offer a "Download my data" button. Scoped to
   * `ctx.user.id`; there is no id input to spoof. Tutor *content* is
   * intentionally excluded (it may be opt-out per `tutorLogOptOut`, and is
   * large) — only session metadata is included.
   */
  exportData: protectedProcedure.query(async ({ ctx }) => {
    const id = ctx.user.id;
    const TAKE = 5000;
    const [
      profile,
      enrollments,
      attempts,
      xpEvents,
      mastery,
      reviews,
      notifications,
      tutorSessions,
      lessonProgress,
      orders,
    ] = await Promise.all([
      ctx.db.user.findUniqueOrThrow({
        where: { id },
        select: {
          id: true,
          email: true,
          name: true,
          firstName: true,
          role: true,
          headline: true,
          bio: true,
          ageBand: true,
          parentEmail: true,
          createdAt: true,
        },
      }),
      ctx.db.enrollment.findMany({
        where: { userId: id },
        select: { courseId: true, progressPct: true, enrolledAt: true },
      }),
      ctx.db.attempt.findMany({
        where: { userId: id },
        take: TAKE,
        orderBy: { createdAt: "desc" },
        select: {
          lessonId: true,
          blockId: true,
          correct: true,
          score: true,
          createdAt: true,
        },
      }),
      ctx.db.xPEvent.findMany({
        where: { userId: id },
        take: TAKE,
        orderBy: { createdAt: "desc" },
        select: { points: true, source: true, refId: true, createdAt: true },
      }),
      ctx.db.mastery.findMany({
        where: { userId: id },
        select: { skillId: true, level: true, updatedAt: true },
      }),
      ctx.db.review.findMany({
        where: { userId: id },
        select: { courseId: true, rating: true, body: true, createdAt: true },
      }),
      ctx.db.notification.findMany({
        where: { userId: id },
        take: TAKE,
        orderBy: { createdAt: "desc" },
        select: { kind: true, title: true, body: true, createdAt: true },
      }),
      ctx.db.tutorSession.findMany({
        where: { userId: id },
        select: { id: true, lessonId: true, createdAt: true },
      }),
      ctx.db.lessonProgress.findMany({
        where: { userId: id },
        select: { lessonId: true, completedAt: true },
      }),
      ctx.db.order.findMany({
        where: { userId: id },
        select: {
          courseId: true,
          pathId: true,
          grossCents: true,
          currency: true,
          status: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      profile,
      enrollments,
      attempts,
      xpEvents,
      mastery,
      reviews,
      notifications,
      tutorSessions,
      lessonProgress,
      orders,
    };
  }),

  /**
   * Account deletion (R43, DPDP/COPPA right-to-erasure). Anonymises the
   * user's PII rather than hard-deleting the row: a hard delete cascades
   * into Orders (the buyer FK is `onDelete: Cascade`, and that same Order
   * row is the *teacher's* sale record) and every Attempt/XP event, which
   * would corrupt financial history and platform analytics. Instead we
   * tombstone the identity — email → unguessable sentinel, names/bio/
   * avatars/password cleared, `deletedAt` stamped — and drop the OAuth
   * `Account` links + sessions so sign-in is refused. De-identified domain
   * rows are retained.
   *
   * Refused for teachers who authored courses or have sales: their content
   * and payout identity can't simply vanish — they must contact support to
   * transfer/unpublish first. Requires typing "DELETE" to confirm.
   *
   * Note: with the JWT session strategy an already-issued token can't be
   * revoked server-side, so the client must call signOut() right after —
   * re-login is blocked (email tombstoned + `deletedAt` gate in authorize).
   */
  deleteAccount: protectedProcedure
    .input(z.object({ confirm: z.literal("DELETE") }))
    .mutation(async ({ ctx }) => {
      const id = ctx.user.id;
      const [authoredCourses, soldOrders] = await Promise.all([
        ctx.db.course.count({ where: { authorId: id } }),
        ctx.db.order.count({ where: { teacherId: id } }),
      ]);
      if (authoredCourses > 0 || soldOrders > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Accounts with authored courses or sales can't be self-deleted — your content and payout records depend on it. Contact support to transfer or unpublish first.",
        });
      }

      const tombstone = `deleted+${id}@deleted.lyceum.invalid`;
      await ctx.db.$transaction([
        ctx.db.account.deleteMany({ where: { userId: id } }),
        ctx.db.session.deleteMany({ where: { userId: id } }),
        ctx.db.user.update({
          where: { id },
          data: {
            email: tombstone,
            name: null,
            firstName: null,
            avatarUrl: null,
            image: null,
            headline: null,
            bio: null,
            passwordHash: null,
            parentEmail: null,
            deletedAt: new Date(),
          },
        }),
      ]);
      return { ok: true as const };
    }),
});
