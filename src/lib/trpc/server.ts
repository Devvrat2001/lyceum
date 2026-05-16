// Server-side tRPC caller for use in Server Components.
// Lets us await trpc.x.y() directly without hitting the HTTP layer.
import "server-only";
import { appRouter } from "@/server/routers/_app";
import { createContext } from "@/server/context";

export async function getServerCaller() {
  return appRouter.createCaller(await createContext());
}
