import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape }) {
    return shape;
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      ...ctx,
      // Narrow non-null for downstream procedures.
      session: ctx.session,
      user: ctx.session.user,
    },
  });
});

export const studentProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "STUDENT" && ctx.user.role !== "ADMIN") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next();
});

export const teacherProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "TEACHER" && ctx.user.role !== "ADMIN") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next();
});

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "ADMIN") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next();
});

export const parentProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "PARENT" && ctx.user.role !== "ADMIN") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next();
});

export { TRPCError };
