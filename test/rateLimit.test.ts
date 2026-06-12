/**
 * checkAIQuota — anonymous callers must be rate-limited PER CALLER
 * (hashed-IP anonKey stamped into the audit payload), not through one
 * global bucket: before this, a single crawler exhausted AI search for
 * every signed-out visitor platform-wide (REQUIREMENTS R6). The global
 * anon ceiling stays on as a distributed-abuse backstop.
 *
 * Rows are seeded straight into AuditLog with a vitest-only kind
 * (matching the `ai.` prefix filter) and wiped in cleanup — they're
 * synthetic quota fuel, not real audit history.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { checkAIQuota } from "@/lib/rateLimit";

const KIND = "ai.test_vitest_quota";

async function wipe() {
  await db.auditLog.deleteMany({ where: { kind: KIND } });
}

beforeAll(wipe);
afterAll(wipe);

function seedAnonRows(anonKey: string, n: number) {
  return db.auditLog.createMany({
    data: Array.from({ length: n }, () => ({
      actorId: null,
      kind: KIND,
      payload: { anonKey, test: true },
    })),
  });
}

describe("checkAIQuota (anonymous, per-caller)", () => {
  it("an exhausted caller is blocked while a different caller still passes", async () => {
    const hot = `test-vitest-key-${crypto.randomUUID().slice(0, 8)}`;
    const cold = `test-vitest-key-${crypto.randomUUID().slice(0, 8)}`;
    await seedAnonRows(hot, 4); // per-caller minute limit

    await expect(
      checkAIQuota({ actorId: null, anonKey: hot, kind: KIND })
    ).rejects.toThrow(/last minute/);

    await expect(
      checkAIQuota({ actorId: null, anonKey: cold, kind: KIND })
    ).resolves.toBeUndefined();
  });

  it("the global anon ceiling still backstops keyed callers", async () => {
    await wipe();
    // 20 rows across many different keys = global minute ceiling.
    for (let i = 0; i < 20; i++) {
      await seedAnonRows(`test-vitest-spread-${i}`, 1);
    }
    await expect(
      checkAIQuota({
        actorId: null,
        anonKey: "test-vitest-fresh-key",
        kind: KIND,
      })
    ).rejects.toThrow(/Anonymous AI traffic/);
  });

  it("signed-in callers are unaffected by anonymous noise", async () => {
    await expect(
      checkAIQuota({ actorId: "test-vitest-some-user", kind: KIND })
    ).resolves.toBeUndefined();
  });
});
