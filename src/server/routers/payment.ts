import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router, teacherProcedure } from "../trpc";
import {
  computeFeeCents,
  getStripe,
  isStripeEnabled,
} from "@/lib/payments/stripe";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";
import { sendOrderReceipt } from "@/lib/email";
import { ensureEnrollment } from "../services/enrollment";

/**
 * Stripe Checkout Session shape (subset we use). Imported as a structural
 * type so we don't need the `stripe` package to be installed.
 */
type StripeCheckout = {
  create: (params: Record<string, unknown>) => Promise<{
    id: string;
    url: string | null;
  }>;
};
type StripeAccountsApi = {
  create: (params: Record<string, unknown>) => Promise<{ id: string }>;
  retrieve: (id: string) => Promise<{
    payouts_enabled?: boolean;
    charges_enabled?: boolean;
    details_submitted?: boolean;
  }>;
};
type StripeAccountLinksApi = {
  create: (params: Record<string, unknown>) => Promise<{ url: string }>;
};
type StripeLike = {
  checkout: { sessions: StripeCheckout };
  accounts: StripeAccountsApi;
  accountLinks: StripeAccountLinksApi;
};

export const paymentRouter = router({
  /**
   * Start a checkout flow for a paid course. Returns a `url` the
   * client redirects the user to.
   *
   * - Stripe mode: real Checkout Session, redirects to Stripe-hosted UI
   * - Demo mode: our own /demo-checkout/[orderId] page that simulates
   *   the same outcome (creates Enrollment + flips Order to PAID)
   *
   * Free courses (priceCents=0) are rejected — use course.enroll for those.
   */
  createCheckoutSession: protectedProcedure
    .input(z.object({ courseId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const course = await ctx.db.course.findUnique({
        where: { id: input.courseId },
        include: {
          author: { include: { stripeAccount: true } },
        },
      });
      if (!course) throw new TRPCError({ code: "NOT_FOUND" });
      if (course.priceCents <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Use course.enroll for free courses.",
        });
      }
      // Already enrolled? Just hand them back to the lesson.
      const existing = await ctx.db.enrollment.findUnique({
        where: {
          userId_courseId: {
            userId: ctx.user.id,
            courseId: course.id,
          },
        },
      });
      if (existing) {
        return {
          alreadyEnrolled: true as const,
          url: `/course/${course.slug}`,
          orderId: null,
        };
      }

      const grossCents = course.priceCents;
      const feeCents = computeFeeCents(grossCents);
      const netCents = grossCents - feeCents;
      const provider = isStripeEnabled() ? "stripe" : "demo";
      const successUrl = `${env.PUBLIC_BASE_URL}/checkout/success?courseSlug=${course.slug}`;
      const cancelUrl = `${env.PUBLIC_BASE_URL}/course/${course.slug}`;

      // Insert the Order row first (PENDING) so the webhook (or demo
      // confirm) has something to flip to PAID.
      //
      // externalId is @unique. The demo value is final; the stripe value
      // is a placeholder, overwritten with the real Checkout Session id
      // below. The placeholder MUST be unique per order — a constant
      // ("stripe_pending") collides the instant a second order is pending,
      // and a single never-completed order would block ALL future Stripe
      // checkouts on the unique constraint.
      const externalId =
        provider === "demo"
          ? `demo_${crypto.randomUUID()}`
          : `stripe_pending_${crypto.randomUUID()}`;
      const order = await ctx.db.order.create({
        data: {
          userId: ctx.user.id,
          courseId: course.id,
          teacherId: course.authorId,
          grossCents,
          feeCents,
          netCents,
          currency: "usd",
          status: "PENDING",
          provider,
          externalId,
        },
      });

      let url: string;

      if (provider === "demo") {
        url = `/demo-checkout/${order.id}`;
      } else {
        const stripe = (await getStripe()) as StripeLike | null;
        if (!stripe) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Stripe is enabled in env but the SDK isn't installed.",
          });
        }
        const session = await stripe.checkout.sessions.create({
          mode: "payment",
          payment_method_types: ["card"],
          success_url: `${successUrl}&sid={CHECKOUT_SESSION_ID}`,
          cancel_url: cancelUrl,
          client_reference_id: order.id,
          customer_email: ctx.user.email ?? undefined,
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: "usd",
                unit_amount: grossCents,
                product_data: { name: course.title },
              },
            },
          ],
          // Route the teacher's net to their Connect account if onboarded.
          // Also stamp orderId on the PaymentIntent's metadata so the
          // refund webhook (charge.refunded) can resolve back to our
          // Order — Charges inherit metadata from their PaymentIntent,
          // NOT from the Checkout Session.
          payment_intent_data: {
            metadata: {
              orderId: order.id,
              courseId: course.id,
              teacherId: course.authorId,
            },
            ...(course.author.stripeAccount?.payoutsEnabled
              ? {
                  application_fee_amount: feeCents,
                  transfer_data: {
                    destination: course.author.stripeAccount.externalId,
                  },
                }
              : {}),
          },
          metadata: {
            orderId: order.id,
            courseId: course.id,
            teacherId: course.authorId,
          },
        });
        if (!session.url) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Stripe returned no checkout URL",
          });
        }
        await ctx.db.order.update({
          where: { id: order.id },
          data: { externalId: session.id },
        });
        url = session.url;
      }

      await audit({
        actorId: ctx.user.id,
        kind: "course.publish", // reuse existing kind enum; "payment.checkout_start" can come later
        payload: {
          variant: "checkout_start",
          provider,
          courseId: course.id,
          orderId: order.id,
          grossCents,
        },
        courseId: course.id,
      });

      return { url, orderId: order.id, provider, alreadyEnrolled: false as const };
    }),

  /**
   * Demo-mode "I clicked Pay" handler. Real Stripe goes through
   * /api/stripe/webhook instead. This procedure is what
   * /demo-checkout/[orderId] calls when the user confirms the fake
   * purchase. It's gated to the original buyer.
   */
  demoConfirm: protectedProcedure
    .input(z.object({ orderId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const order = await ctx.db.order.findUnique({
        where: { id: input.orderId },
        include: { course: { select: { slug: true, id: true } } },
      });
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      if (order.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (order.provider !== "demo") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only demo orders can be confirmed via this endpoint.",
        });
      }
      if (order.status === "PAID") {
        return { ok: true as const, alreadyPaid: true, courseSlug: order.course.slug };
      }
      await ctx.db.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: order.id },
          data: { status: "PAID", paidAt: new Date() },
        });
        await ensureEnrollment(tx, order.userId, order.courseId, {
          lastActivityAt: new Date(),
        });
      });
      // Purchase receipt — best-effort, swallows its own errors so it
      // can never break the confirm.
      await sendOrderReceipt(order.id);
      return {
        ok: true as const,
        alreadyPaid: false,
        courseSlug: order.course.slug,
      };
    }),

  /**
   * Teacher earnings summary: lifetime + MTD + pending Stripe onboarding state.
   * Returns the underlying paid orders for the table.
   */
  teacherEarnings: teacherProcedure
    .input(
      z.object({ limit: z.number().int().min(1).max(50).default(20) }).optional()
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 20;
      const teacherId = ctx.user.id;
      const monthStart = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1
      );

      const [lifetimeAgg, mtdAgg, visibleOrders, account] = await Promise.all([
        ctx.db.order.aggregate({
          // Lifetime + MTD aggregates exclude refunded orders so the
          // teacher's KPIs reflect "money that's actually theirs", not
          // gross-of-refunds.
          where: { teacherId, status: "PAID" },
          _sum: { netCents: true, grossCents: true, feeCents: true },
          _count: { _all: true },
        }),
        ctx.db.order.aggregate({
          where: { teacherId, status: "PAID", paidAt: { gte: monthStart } },
          _sum: { netCents: true },
        }),
        ctx.db.order.findMany({
          // List shows both PAID and REFUNDED so the teacher can see
          // what they refunded recently. PENDING / FAILED stay out;
          // they're transient and noisy.
          where: { teacherId, status: { in: ["PAID", "REFUNDED"] } },
          orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
          take: limit,
          include: {
            course: { select: { title: true, slug: true } },
            user: { select: { name: true, firstName: true } },
          },
        }),
        ctx.db.stripeAccount.findUnique({ where: { teacherId } }),
      ]);

      return {
        lifetime: {
          netCents: lifetimeAgg._sum.netCents ?? 0,
          grossCents: lifetimeAgg._sum.grossCents ?? 0,
          feeCents: lifetimeAgg._sum.feeCents ?? 0,
          count: lifetimeAgg._count._all,
        },
        mtdNetCents: mtdAgg._sum.netCents ?? 0,
        orders: visibleOrders.map((o) => ({
          id: o.id,
          createdAt: o.createdAt.toISOString(),
          paidAt: o.paidAt?.toISOString() ?? null,
          refundedAt: o.refundedAt?.toISOString() ?? null,
          status: o.status,
          netCents: o.netCents,
          grossCents: o.grossCents,
          courseTitle: o.course.title,
          courseSlug: o.course.slug,
          buyerName: o.user.name ?? o.user.firstName ?? "Anonymous",
          provider: o.provider,
        })),
        stripeAccount: account
          ? {
              id: account.id,
              externalId: account.externalId,
              payoutsEnabled: account.payoutsEnabled,
              chargesEnabled: account.chargesEnabled,
              provider: account.provider,
            }
          : null,
      };
    }),

  /**
   * Teacher-initiated refund of one of their own PAID orders.
   *
   * Demo mode: flips Order to REFUNDED + deletes the Enrollment in
   * one transaction + writes an audit row. Idempotent: re-refunding
   * an already-REFUNDED order returns ok without re-firing the side
   * effects.
   *
   * Real Stripe mode: not yet wired — calls into the Stripe SDK
   * (`stripe.refunds.create({charge})`) need the charge id, which we
   * reach via session → payment_intent → latest_charge. That ships
   * with the Tier 2.2 real-Stripe smoke. For now the mutation throws
   * a clear "real-Stripe refunds are pending wiring" error when
   * STRIPE_SECRET_KEY is set, so we don't pretend to refund.
   *
   * The webhook handler on `charge.refunded` flips the same Order
   * row from the Stripe-dashboard direction; that path is already
   * live so refunds initiated outside the app still work.
   */
  refundOrder: teacherProcedure
    .input(
      z.object({
        orderId: z.string(),
        reason: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const order = await ctx.db.order.findUnique({
        where: { id: input.orderId },
      });
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      if (order.teacherId !== ctx.user.id && ctx.user.role !== "ADMIN") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (order.status === "REFUNDED") {
        return {
          ok: true as const,
          alreadyRefunded: true as const,
          orderId: order.id,
          status: "REFUNDED" as const,
        };
      }
      if (order.status !== "PAID") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Can only refund PAID orders (this one is ${order.status})`,
        });
      }

      if (isStripeEnabled() && order.provider === "stripe") {
        // Real-Stripe refund path lands with Tier 2.2 smoke test.
        // Throw rather than silently demo-refund so we don't lose
        // money in the gap.
        throw new TRPCError({
          code: "NOT_IMPLEMENTED" as never,
          message:
            "Real-Stripe refunds are pending wiring. Issue from the Stripe Dashboard until v2.",
        });
      }

      // Demo refund: flip status + drop the enrollment atomically.
      await ctx.db.$transaction([
        ctx.db.order.update({
          where: { id: order.id },
          data: { status: "REFUNDED", refundedAt: new Date() },
        }),
        ctx.db.enrollment.deleteMany({
          where: { userId: order.userId, courseId: order.courseId },
        }),
      ]);

      await audit({
        actorId: ctx.user.id,
        kind: "payment.refund_initiated",
        payload: {
          orderId: order.id,
          courseId: order.courseId,
          buyerUserId: order.userId,
          grossCents: order.grossCents,
          provider: order.provider,
          mode: "demo",
          reason: input.reason ?? null,
        },
        courseId: order.courseId,
      });

      return {
        ok: true as const,
        alreadyRefunded: false as const,
        orderId: order.id,
        status: "REFUNDED" as const,
      };
    }),

  /**
   * Start Stripe Connect Express onboarding. Returns a `url` the
   * teacher visits to fill in KYC. Demo mode creates a fake account
   * row marked payouts-enabled so the rest of the flow works.
   */
  startConnectOnboarding: teacherProcedure.mutation(async ({ ctx }) => {
    const existing = await ctx.db.stripeAccount.findUnique({
      where: { teacherId: ctx.user.id },
    });

    if (!isStripeEnabled()) {
      // Demo mode — fabricate an account row + return a placeholder URL.
      const acc =
        existing ??
        (await ctx.db.stripeAccount.create({
          data: {
            teacherId: ctx.user.id,
            externalId: `demo_acct_${crypto.randomUUID()}`,
            provider: "demo",
            payoutsEnabled: true,
            chargesEnabled: true,
          },
        }));
      return {
        url: `${env.PUBLIC_BASE_URL}/teacher/earnings?demoConnected=1`,
        accountId: acc.id,
        provider: "demo" as const,
      };
    }

    const stripe = (await getStripe()) as StripeLike | null;
    if (!stripe) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Stripe enabled but SDK not installed.",
      });
    }
    const acct =
      existing?.provider === "stripe"
        ? { id: existing.externalId }
        : await stripe.accounts.create({
            type: "express",
            email: ctx.user.email,
            capabilities: {
              transfers: { requested: true },
              card_payments: { requested: true },
            },
          });
    if (!existing || existing.externalId !== acct.id) {
      await ctx.db.stripeAccount.upsert({
        where: { teacherId: ctx.user.id },
        create: {
          teacherId: ctx.user.id,
          externalId: acct.id,
          provider: "stripe",
        },
        update: { externalId: acct.id, provider: "stripe" },
      });
    }
    const link = await stripe.accountLinks.create({
      account: acct.id,
      refresh_url: `${env.PUBLIC_BASE_URL}/teacher/earnings?stripeRefresh=1`,
      return_url: `${env.PUBLIC_BASE_URL}/teacher/earnings?stripeReturn=1`,
      type: "account_onboarding",
    });
    return { url: link.url, accountId: acct.id, provider: "stripe" as const };
  }),
});
