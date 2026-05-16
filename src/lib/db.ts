import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "@/lib/env";

/**
 * Prisma client singleton (Prisma 7 uses driver adapters at runtime).
 *
 * In dev, Next.js HMR re-evaluates modules, which can spawn a fresh
 * PrismaClient on every change and exhaust connections. Stash on globalThis.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function buildClient() {
  const adapter = new PrismaPg(env.DATABASE_URL);
  return new PrismaClient({
    adapter,
    log:
      env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });
}

export const db = globalForPrisma.prisma ?? buildClient();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = db;
