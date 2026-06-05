import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getServerCaller } from "@/lib/trpc/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  blockId: z.string().min(1),
  chosenIndex: z.number().int().min(0),
});

/**
 * Replay endpoint for offline-queued attempts (see lib/offline). The client
 * flushes its IndexedDB queue here on reconnect; we re-run lesson.attemptBlock
 * as the signed-in user via the server caller — same validation, ownership,
 * XP, and streak side effects as a live submit. Returns 401 when the session
 * has lapsed so the client keeps the attempt queued until the user signs in.
 */
export async function POST(req: Request) {
  let input: z.infer<typeof Schema>;
  try {
    input = Schema.parse(await req.json());
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const trpc = await getServerCaller();
  try {
    await trpc.lesson.attemptBlock(input);
    return Response.json({ ok: true });
  } catch (err) {
    const code = err instanceof TRPCError ? err.code : "INTERNAL_SERVER_ERROR";
    const status = code === "UNAUTHORIZED" ? 401 : code === "NOT_FOUND" ? 404 : 500;
    return new Response("Replay failed", { status });
  }
}
