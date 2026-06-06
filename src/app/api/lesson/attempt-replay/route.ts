import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getServerCaller } from "@/lib/trpc/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Discriminated by `kind`; each `input` mirrors the matching mutation's Zod
 * schema (the server re-validates via the tRPC procedure anyway). Bounds are
 * generous on purpose — the procedure enforces the real ones.
 */
const Schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("attemptBlock"),
    input: z.object({
      blockId: z.string().min(1),
      chosenIndex: z.number().int().min(0).max(9),
      subIndex: z.number().int().min(0).max(19).optional(),
      hintsUsed: z.number().int().min(0).max(3).optional(),
      timeMs: z.number().int().nonnegative().optional(),
    }),
  }),
  z.object({
    kind: z.literal("votePoll"),
    input: z.object({
      blockId: z.string().min(1),
      chosenIndex: z.number().int().min(0).max(19),
    }),
  }),
  z.object({
    kind: z.literal("completeDragMatch"),
    input: z.object({
      blockId: z.string().min(1),
      placements: z.array(z.number().int().nullable()).min(2).max(8),
      timeMs: z.number().int().nonnegative().optional(),
    }),
  }),
  z.object({
    kind: z.literal("completeBranching"),
    input: z.object({
      blockId: z.string().min(1),
      terminalNodeId: z.string().min(1),
      timeMs: z.number().int().nonnegative().optional(),
    }),
  }),
]);

/**
 * Replay endpoint for offline-queued student actions (see lib/offline). The
 * client flushes its IndexedDB queue here on reconnect; we re-run the matching
 * `lesson.*` mutation as the signed-in user via the server caller — same
 * validation, ownership, XP, and streak side effects as a live submit. Returns
 * 401 when the session has lapsed so the client keeps the action queued until
 * the user signs in.
 */
export async function POST(req: Request) {
  let action: z.infer<typeof Schema>;
  try {
    action = Schema.parse(await req.json());
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const trpc = await getServerCaller();
  try {
    switch (action.kind) {
      case "attemptBlock":
        await trpc.lesson.attemptBlock(action.input);
        break;
      case "votePoll":
        await trpc.lesson.votePoll(action.input);
        break;
      case "completeDragMatch":
        await trpc.lesson.completeDragMatch(action.input);
        break;
      case "completeBranching":
        await trpc.lesson.completeBranching(action.input);
        break;
    }
    return Response.json({ ok: true });
  } catch (err) {
    const code = err instanceof TRPCError ? err.code : "INTERNAL_SERVER_ERROR";
    const status =
      code === "UNAUTHORIZED" ? 401 : code === "NOT_FOUND" ? 404 : 500;
    return new Response("Replay failed", { status });
  }
}
