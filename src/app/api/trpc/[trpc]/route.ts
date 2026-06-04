import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import * as Sentry from "@sentry/nextjs";
import { appRouter } from "@/server/routers/_app";
import { createContext } from "@/server/context";

// Vercel default for serverless functions is 10s on Hobby, which is too
// short for AI calls — Claude/OpenAI course-outline generations regularly
// take 20-45s. Bump to the Hobby ceiling (60s). Browsers see a generic
// "Failed to fetch" if the function is killed mid-stream.
export const maxDuration = 60;

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext,
    onError({ error, path }) {
      // Always log in production too — the AI builder failures were
      // invisible because we only logged in dev, so Vercel logs showed
      // a 200 with no error context. The actual Anthropic/OpenAI error
      // is in `error.cause`.
      console.error(`tRPC ${path ?? "<no-path>"} —`, {
        code: error.code,
        message: error.message,
        cause:
          error.cause instanceof Error
            ? { name: error.cause.name, message: error.cause.message }
            : error.cause,
      });
      // Phase 6.2 — report genuine server faults to Sentry (no-op until a DSN
      // is set). Only INTERNAL_SERVER_ERROR: expected client errors (auth,
      // validation, not-found) are noise in an error tracker. Prefer the
      // underlying cause (the real Anthropic/OpenAI/Prisma error) over the
      // TRPCError wrapper.
      if (error.code === "INTERNAL_SERVER_ERROR") {
        Sentry.captureException(error.cause ?? error, {
          tags: { trpcPath: path ?? "<no-path>" },
        });
      }
    },
  });

export { handler as GET, handler as POST };
