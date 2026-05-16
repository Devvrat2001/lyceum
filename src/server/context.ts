import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import type { Session } from "next-auth";

export type Context = {
  db: typeof db;
  session: Session | null;
};

export async function createContext(): Promise<Context> {
  return {
    db,
    session: await auth(),
  };
}
