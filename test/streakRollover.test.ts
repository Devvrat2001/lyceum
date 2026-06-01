/**
 * Smoke: `expireStaleStreaks` — the daily streak-rollover sweep behind
 * `/api/cron/streak-rollover`. It's a *global* updateMany, so to avoid
 * mutating seeded/real streaks in the shared dev DB we run it with a fake
 * `now` in the year 2001: the rollover cutoff (yesterday = 2001-01-14) only
 * ever catches the streaks this test creates, since every real streak has a
 * 2026+ `lastDay` that sits after the cutoff.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { expireStaleStreaks } from "@/server/services/streakEngine";
import { cleanupTestUsers, createTestUser } from "./helpers";

const NOW = new Date("2001-01-15T12:00:00Z"); // today = 2001-01-15, cutoff = 2001-01-14
const d = (iso: string) => new Date(iso);

beforeAll(async () => {
  await cleanupTestUsers();
});
afterAll(async () => {
  await cleanupTestUsers();
});

async function streakFor(lastDay: Date, current: number, longest = current) {
  const u = await createTestUser({ role: "STUDENT" });
  await db.streak.create({ data: { userId: u.id, current, longest, lastDay } });
  return u;
}

describe("expireStaleStreaks (daily rollover)", () => {
  it("breaks stale streaks, spares yesterday/today, ignores current=0, keeps longest", async () => {
    const stale = await streakFor(d("2001-01-10T00:00:00Z"), 14, 20); // < cutoff → break
    const yday = await streakFor(d("2001-01-14T00:00:00Z"), 5); //        == cutoff → alive
    const today = await streakFor(d("2001-01-15T00:00:00Z"), 3); //       today → alive
    const zero = await streakFor(d("2001-01-10T00:00:00Z"), 0); //        stale but already 0

    const broken = await expireStaleStreaks(db, NOW);
    expect(broken).toBe(1); // only `stale` qualifies (current>0 AND lastDay<cutoff)

    const cur = async (userId: string) =>
      (await db.streak.findUnique({ where: { userId } }))?.current;

    expect(await cur(stale.id)).toBe(0);
    expect(
      (await db.streak.findUnique({ where: { userId: stale.id } }))?.longest
    ).toBe(20); // all-time best left untouched
    expect(await cur(yday.id)).toBe(5);
    expect(await cur(today.id)).toBe(3);
    expect(await cur(zero.id)).toBe(0);
  });

  it("is idempotent — a second sweep the same day breaks nothing new", async () => {
    const stale = await streakFor(d("2001-01-05T00:00:00Z"), 9, 9);

    const first = await expireStaleStreaks(db, NOW);
    expect(first).toBeGreaterThanOrEqual(1);

    const second = await expireStaleStreaks(db, NOW);
    expect(second).toBe(0);

    expect(
      (await db.streak.findUnique({ where: { userId: stale.id } }))?.current
    ).toBe(0);
  });
});
