import { z } from "zod";
import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../trpc";

const PASSWORD_MIN = 8;

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

      return user;
    }),
});
