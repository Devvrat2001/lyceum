import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  adminProcedure,
  protectedProcedure,
  router,
  teacherProcedure,
} from "../trpc";
import {
  computeFeeCents,
  getStripe,
  isStripeEnabled,
} from "@/lib/payments/stripe";
import {
  createPaymentLink,
  isRazorpayEnabled,
} from "@/lib/payments/razorpay";
import { CURRENCY } from "@/lib/currency";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";
import { sendOrderReceipt } from "@/lib/email";
import {
  fulfillPaidOrder,
  revokePaidOrder,
} from "../services/fulfillOrder";

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
      // Provider precedence: Razorpay (India launch — UPI) wins when
      // configured, then Stripe (international, dormant for now), then
      // the demo flow. All three are redirect-shaped, so the client
      // just follows `url` regardless.
      const provider = isRazorpayEnabled()
        ? "razorpay"
        : isStripeEnabled()
          ? "stripe"
          : "demo";
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
          : `${provider}_pending_${crypto.randomUUID()}`;
      const order = await ctx.db.order.create({
        data: {
          userId: ctx.user.id,
          courseId: course.id,
          teacherId: course.authorId,
          grossCents,
          feeCents,
          netCents,
          currency: CURRENCY.code,
          status: "PENDING",
          provider,
          externalId,
        },
      });

      let url: string;

      if (provider === "demo") {
        url = `/demo-checkout/${order.id}`;
      } else if (provider === "razorpay") {
        // Payment Link: redirect-shaped like Stripe Checkout. The
        // platform fee is recorded on the Order (computeFeeCents above);
        // actual revenue-split transfers (Razorpay Route) are phase 2 —
        // collections land in the platform account until then, mirroring
        // how Stripe ran before Connect onboarding.
        const link = await createPaymentLink({
          amountPaise: grossCents,
          referenceId: order.id,
          description: course.title.slice(0, 250),
          customerEmail: ctx.user.email ?? undefined,
          callbackUrl: successUrl,
        });
        await ctx.db.order.update({
          where: { id: order.id },
          data: { externalId: link.id },
        });
        url = link.short_url;
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
                // Follows the launch currency; the international phase
                // makes this per-order (Stripe is dormant until then).
                currency: CURRENCY.code,
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
   * Start a checkout flow for a PAID multi-course bundle (path).
   * Mirrors createCheckoutSession: returns a `url` the client redirects
   * to (Razorpay Payment Link / Stripe Checkout / the demo page). Free
   * bundles are rejected — path.enroll handles those without an Order.
   * Fulfillment (webhooks / demoConfirm) enrolls EVERY course in the
   * path via fulfillPaidOrder.
   */
  createPathCheckout: protectedProcedure
    .input(z.object({ pathId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const path = await ctx.db.path.findUnique({
        where: { id: input.pathId },
        include: { courses: { select: { courseId: true } } },
      });
      if (!path) throw new TRPCError({ code: "NOT_FOUND" });
      if (path.priceCents <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Use path.enroll for free bundles.",
        });
      }
      if (path.courses.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This bundle has no courses yet.",
        });
      }
      // Fully-owned short circuit — never invite a student to re-buy a
      // bundle whose every course is already in their library.
      const ownedCount = await ctx.db.enrollment.count({
        where: {
          userId: ctx.user.id,
          courseId: { in: path.courses.map((c) => c.courseId) },
        },
      });
      if (ownedCount >= path.courses.length) {
        return {
          alreadyEnrolled: true as const,
          url: "/student/library",
          orderId: null,
        };
      }

      const grossCents = path.priceCents;
      const feeCents = computeFeeCents(grossCents);
      const netCents = grossCents - feeCents;
      const provider = isRazorpayEnabled()
        ? "razorpay"
        : isStripeEnabled()
          ? "stripe"
          : "demo";
      const successUrl = `${env.PUBLIC_BASE_URL}/checkout/success?pathSlug=${path.slug}`;
      const cancelUrl = `${env.PUBLIC_BASE_URL}/`;

      const externalId =
        provider === "demo"
          ? `demo_${crypto.randomUUID()}`
          : `${provider}_pending_${crypto.randomUUID()}`;
      const order = await ctx.db.order.create({
        data: {
          userId: ctx.user.id,
          pathId: path.id,
          // Teacher-owned bundles attribute earnings to their author;
          // platform-curated (seeded) bundles have no teacher.
          teacherId: path.authorId,
          grossCents,
          feeCents,
          netCents,
          currency: CURRENCY.code,
          status: "PENDING",
          provider,
          externalId,
        },
      });

      let url: string;
      if (provider === "demo") {
        url = `/demo-checkout/${order.id}`;
      } else if (provider === "razorpay") {
        const link = await createPaymentLink({
          amountPaise: grossCents,
          referenceId: order.id,
          description: path.title.slice(0, 250),
          customerEmail: ctx.user.email ?? undefined,
          callbackUrl: successUrl,
        });
        await ctx.db.order.update({
          where: { id: order.id },
          data: { externalId: link.id },
        });
        url = link.short_url;
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
                currency: CURRENCY.code,
                unit_amount: grossCents,
                product_data: { name: path.title },
              },
            },
          ],
          // No Connect transfer_data for bundles yet — multi-teacher
          // splits need per-course apportioning; phase 2 alongside
          // Razorpay Route.
          metadata: { orderId: order.id, pathId: path.id },
          payment_intent_data: {
            metadata: { orderId: order.id, pathId: path.id },
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
        kind: "course.publish",
        payload: {
          variant: "checkout_start",
          provider,
          pathId: path.id,
          orderId: order.id,
          grossCents,
        },
      });

      return {
        url,
        orderId: order.id,
        provider,
        alreadyEnrolled: false as const,
      };
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
        include: {
          course: { select: { slug: true, id: true } },
          path: { select: { slug: true } },
        },
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
        return {
          ok: true as const,
          alreadyPaid: true,
          courseSlug: order.course?.slug ?? null,
          pathSlug: order.path?.slug ?? null,
        };
      }
      // Shared fulfillment: PAID flip + enrollment(s) — single course or
      // every course in a bundle — identical to the webhook paths.
      await fulfillPaidOrder(ctx.db, order);
      // Purchase receipt — best-effort, swallows its own errors so it
      // can never break the confirm.
      await sendOrderReceipt(order.id);
      return {
        ok: true as const,
        alreadyPaid: false,
        courseSlug: order.course?.slug ?? null,
        pathSlug: order.path?.slug ?? null,
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
            path: { select: { title: true } },
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
          courseTitle:
            o.course?.title ??
            (o.path ? `Bundle · ${o.path.title}` : "—"),
          courseSlug: o.course?.slug ?? null,
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

      // Only demo orders may take the demo-refund branch below. A
      // razorpay/stripe order falling through would flip the DB to
      // REFUNDED and revoke the enrollment WITHOUT moving any actual
      // money at the provider — the student paid, lost access, and got
      // nothing back. (The old guard only caught stripe-while-stripe-
      // enabled; razorpay orders fell straight through. REQUIREMENTS R2.)
      if (order.provider !== "demo") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            order.provider === "razorpay"
              ? "Issue this refund from the Razorpay Dashboard — in-app Razorpay refunds aren't wired yet."
              : "Issue this refund from the Stripe Dashboard — the charge.refunded webhook syncs it back.",
        });
      }

      // Bundle orders span multiple courses with their own enrollment
      // semantics — out of scope for the demo refund. v1: refuse.
      const refundCourseId = order.courseId;
      if (order.pathId || !refundCourseId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Bundle orders can't be refunded from here yet — contact support.",
        });
      }

      // Demo refund: shared revocation (REFUNDED flip + enrollment +
      // honest enrollCount decrement in one tx — same service the
      // Stripe/Razorpay refund webhooks use).
      await revokePaidOrder(ctx.db, order);

      await audit({
        actorId: ctx.user.id,
        kind: "payment.refund_initiated",
        payload: {
          orderId: order.id,
          courseId: refundCourseId,
          buyerUserId: order.userId,
          grossCents: order.grossCents,
          provider: order.provider,
          mode: "demo",
          reason: input.reason ?? null,
        },
        courseId: refundCourseId,
      });

      return {
        ok: true as const,
        alreadyRefunded: false as const,
        orderId: order.id,
        status: "REFUNDED" as const,
      };
    }),

  /**
   * Admin links a teacher to a Razorpay Route linked account (acc_…).
   * Admin-only on purpose: linked accounts are created by the platform
   * in the Razorpay Dashboard (Route → Account, with the teacher's bank
   * details), so letting teachers self-claim arbitrary ids would route
   * other people's money. Once the account's status is "activated", the
   * razorpay webhook starts splitting net revenue to it on every paid
   * order.
   */
  linkRazorpayAccount: adminProcedure
    .input(
      z.object({
        teacherId: z.string().min(1),
        accountId: z
          .string()
          .regex(
            /^acc_[A-Za-z0-9]+$/,
            "Expected a Razorpay linked-account id (acc_…)"
          ),
        status: z
          .enum(["created", "activated", "suspended"])
          .default("activated"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const teacher = await ctx.db.user.findUnique({
        where: { id: input.teacherId },
        select: { id: true, role: true },
      });
      if (!teacher || teacher.role !== "TEACHER") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "teacherId must be a TEACHER account.",
        });
      }
      const account = await ctx.db.razorpayAccount.upsert({
        where: { teacherId: input.teacherId },
        update: { externalId: input.accountId, status: input.status },
        create: {
          teacherId: input.teacherId,
          externalId: input.accountId,
          status: input.status,
        },
      });
      await audit({
        actorId: ctx.user.id,
        kind: "payment.razorpay_account_linked",
        payload: {
          teacherId: input.teacherId,
          accountId: input.accountId,
          status: input.status,
        },
      });
      return {
        ok: true as const,
        accountId: account.externalId,
        status: account.status,
      };
    }),

  /**
   * The signed-in teacher's Razorpay payout-link state — feeds the
   * earnings page's "UPI payouts" status line.
   */
  razorpayPayoutStatus: teacherProcedure.query(async ({ ctx }) => {
    const acct = await ctx.db.razorpayAccount.findUnique({
      where: { teacherId: ctx.user.id },
      select: { status: true },
    });
    return acct
      ? { linked: true as const, status: acct.status }
      : { linked: false as const, status: null };
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
