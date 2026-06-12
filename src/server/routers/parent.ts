import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, parentProcedure } from "../trpc";
import { audit } from "@/lib/audit";

/**
 * Parent-facing procedures (REQUIREMENTS R26 — self-service linking).
 * The admin-mediated flow (`admin.linkParentToChild`) stays for
 * institutions; this is the consumer path: the child generates a
 * family code in Settings → Family, the parent redeems it here.
 * Possession of a live code IS the authorization, so unlike the admin
 * flow there's no institution gate.
 */
const LINK_PREFIX = "parentlink:";

export const parentRouter = router({
  linkWithCode: parentProcedure
    .input(z.object({ code: z.string().trim().min(4).max(16) }))
    .mutation(async ({ ctx, input }) => {
      // Normalize generously — codes get read over the phone and typed
      // with stray spaces/dashes/lowercase.
      const code = input.code.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const invalid = () =>
        new TRPCError({
          code: "BAD_REQUEST",
          message:
            "That code isn't valid — ask your child to generate a fresh one in Settings → Family.",
        });

      const row = await ctx.db.verificationToken.findFirst({
        where: { token: code, identifier: { startsWith: LINK_PREFIX } },
      });
      if (!row) throw invalid();
      if (row.expires < new Date()) {
        await ctx.db.verificationToken.deleteMany({
          where: { identifier: row.identifier },
        });
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "That code has expired — ask your child for a fresh one (they last 7 days).",
        });
      }

      const childId = row.identifier.slice(LINK_PREFIX.length);
      const child = await ctx.db.user.findUnique({
        where: { id: childId },
        select: { id: true, role: true, firstName: true, name: true },
      });
      if (!child || child.role !== "STUDENT") {
        await ctx.db.verificationToken.deleteMany({
          where: { identifier: row.identifier },
        });
        throw invalid();
      }

      await ctx.db.parentChild.upsert({
        where: {
          parentId_childId: { parentId: ctx.user.id, childId: child.id },
        },
        create: { parentId: ctx.user.id, childId: child.id },
        update: {},
      });
      // Single-use: redeeming burns the code even though the link
      // upsert is idempotent — a code shared in a group chat shouldn't
      // keep working.
      await ctx.db.verificationToken.deleteMany({
        where: { identifier: row.identifier },
      });

      await audit({
        actorId: ctx.user.id,
        kind: "parent.self_link",
        payload: { childId: child.id },
      });

      return {
        ok: true as const,
        childName: child.firstName ?? child.name ?? "your child",
      };
    }),
});
