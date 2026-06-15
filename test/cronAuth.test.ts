/**
 * Cron auth gate (REQUIREMENTS R53). Every `/api/cron/*` handler shares the
 * same posture: refuse unless `CRON_SECRET` is set AND the request carries
 * `Authorization: Bearer <CRON_SECRET>`. This matters most for the
 * money-spending crons (ai-insights, backfill-embeddings call OpenAI), so
 * the gate must never regress. streak-rollover is the cheap DB-only cron,
 * so it's safe to exercise all three paths end-to-end here; the others use
 * the identical check.
 */
import { afterEach, describe, expect, it } from "vitest";
import { GET as streakRollover } from "@/app/api/cron/streak-rollover/route";

const ORIG = process.env.CRON_SECRET;
afterEach(() => {
  if (ORIG === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIG;
});

function req(headers?: Record<string, string>) {
  return new Request("http://localhost/api/cron/streak-rollover", { headers });
}

describe("cron auth gate (R53) — streak-rollover", () => {
  it("500s when CRON_SECRET isn't configured (won't run open)", async () => {
    delete process.env.CRON_SECRET;
    const res = await streakRollover(req());
    expect(res.status).toBe(500);
  });

  it("401s without a Bearer token or with the wrong one", async () => {
    process.env.CRON_SECRET = "test-secret-xyz";
    expect((await streakRollover(req())).status).toBe(401);
    expect(
      (await streakRollover(req({ authorization: "Bearer nope" }))).status
    ).toBe(401);
  });

  it("runs only with the correct Bearer token", async () => {
    process.env.CRON_SECRET = "test-secret-xyz";
    const res = await streakRollover(
      req({ authorization: "Bearer test-secret-xyz" })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; broken: number };
    expect(body.ok).toBe(true);
    expect(typeof body.broken).toBe("number");
  });
});
