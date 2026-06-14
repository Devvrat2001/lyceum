/**
 * Free-response XP reconciliation (REQUIREMENTS R39). A teacher score
 * override is the authoritative grade, so the XP ledger must follow it:
 * downgrading an AI-passed essay claws the XP back, upgrading a failed
 * one grants it, and clearing the override restores the AI grade. The
 * net free-response XP for an attempt always equals the final grade's
 * target, and the moves are idempotent. The LLM is forced to the
 * deterministic demo grader so the AI score is stable.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import {
  FREE_RESPONSE_XP,
  reconcileFreeResponseXp,
} from "@/server/services/freeResponseXp";
import { cleanupTestUsers, createTestUser } from "./helpers";

vi.mock("@/lib/ai/llm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/llm")>()),
  isLlmEnabled: () => false,
}));

beforeAll(async () => {
  await cleanupTestUsers();
});
afterAll(async () => {
  await cleanupTestUsers();
});

const RUBRIC = "moon orbits earth, sunlit half, angle changes monthly";
const GOOD_ANSWER =
  "The moon orbits the earth once a month, and as the angle changes " +
  "we see different amounts of the sunlit half — that is what makes " +
  "the phases we observe from earth every month.";
const POOR_ANSWER =
  "I am not sure about this one but maybe the clouds move away at night.";

async function makeBlock(teacherId: string, rubric: string) {
  const course = await db.course.create({
    data: {
      slug: `test-vitest-frx-${crypto.randomUUID()}`,
      title: "FRX Fixture",
      description: ".",
      subject: "science",
      grade: "6",
      authorId: teacherId,
      priceCents: 0,
      status: "PUBLISHED",
    },
  });
  const unit = await db.unit.create({
    data: { courseId: course.id, order: 1, title: "U1" },
  });
  const lesson = await db.lesson.create({
    data: {
      unitId: unit.id,
      order: 1,
      title: "Moon Phases",
      slug: `test-vitest-frx-l-${crypto.randomUUID()}`,
    },
  });
  const block = await db.block.create({
    data: {
      lessonId: lesson.id,
      order: 1,
      type: "FREE_RESPONSE",
      settings: { prompt: "Explain why the moon has phases.", rubric },
    },
  });
  return { course, lesson, block };
}

/** Net free-response XP credited for a single attempt. */
async function attemptXp(userId: string, attemptId: string): Promise<number> {
  const agg = await db.xPEvent.aggregate({
    where: {
      userId,
      refId: attemptId,
      source: { in: ["block_free_response_correct", "free_response_override"] },
    },
    _sum: { points: true },
  });
  return agg._sum.points ?? 0;
}

async function submittedAttemptId(
  teacher: Awaited<ReturnType<typeof createTestUser>>,
  lessonTitle: string
): Promise<string> {
  const subs = await teacher.caller.teacher.freeResponseSubmissions({});
  return subs.find((r) => r.lessonTitle === lessonTitle)!.id;
}

describe("free-response XP reconciliation (R39)", () => {
  it("claws XP back when a passing essay is downgraded, and restores on clear", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const { block } = await makeBlock(teacher.id, RUBRIC);

    const graded = await student.caller.lesson.gradeFreeResponse({
      blockId: block.id,
      answer: GOOD_ANSWER,
    });
    expect(graded.correct).toBe(true);
    expect(graded.points).toBe(FREE_RESPONSE_XP);

    const attemptId = await submittedAttemptId(teacher, "Moon Phases");
    expect(await attemptXp(student.id, attemptId)).toBe(FREE_RESPONSE_XP);

    // Downgrade below the pass line → XP is clawed back to zero.
    const down = await teacher.caller.teacher.overrideFreeResponse({
      attemptId,
      score: 30,
    });
    expect(down.xpDelta).toBe(-FREE_RESPONSE_XP);
    expect(await attemptXp(student.id, attemptId)).toBe(0);

    // The original positive award is preserved; the claw-back is a
    // separate negative ledger row (audit-friendly, not a deletion).
    const original = await db.xPEvent.findFirst({
      where: { refId: attemptId, source: "block_free_response_correct" },
    });
    expect(original?.points).toBe(FREE_RESPONSE_XP);

    // The student is told their points moved.
    const note = await db.notification.findFirst({
      where: { userId: student.id, kind: "grade_updated" },
    });
    expect(note).not.toBeNull();
    expect(note?.body).toContain("Moon Phases");

    // Clearing the override falls back to the (passing) AI grade → XP
    // is restored to the full award.
    const cleared = await teacher.caller.teacher.overrideFreeResponse({
      attemptId,
      score: null,
    });
    expect(cleared.xpDelta).toBe(FREE_RESPONSE_XP);
    expect(await attemptXp(student.id, attemptId)).toBe(FREE_RESPONSE_XP);
  });

  it("grants XP when a failed essay is upgraded, and is idempotent", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    // An obscure rubric the demo grader can't match → a failing grade.
    const { block } = await makeBlock(
      teacher.id,
      "umbra penumbra libration apogee perigee synodic anomalistic draconic"
    );

    const graded = await student.caller.lesson.gradeFreeResponse({
      blockId: block.id,
      answer: POOR_ANSWER,
    });
    expect(graded.correct).toBe(false);
    expect(graded.points).toBe(0);

    const attemptId = await submittedAttemptId(teacher, "Moon Phases");
    expect(await attemptXp(student.id, attemptId)).toBe(0);

    // Upgrade above the pass line → XP is granted.
    const up = await teacher.caller.teacher.overrideFreeResponse({
      attemptId,
      score: 90,
    });
    expect(up.xpDelta).toBe(FREE_RESPONSE_XP);
    expect(await attemptXp(student.id, attemptId)).toBe(FREE_RESPONSE_XP);

    // A second override that stays in the passing band moves nothing.
    const again = await teacher.caller.teacher.overrideFreeResponse({
      attemptId,
      score: 95,
    });
    expect(again.xpDelta).toBe(0);
    expect(await attemptXp(student.id, attemptId)).toBe(FREE_RESPONSE_XP);

    // Exactly one override (delta) row was written despite two calls.
    const overrideRows = await db.xPEvent.count({
      where: { refId: attemptId, source: "free_response_override" },
    });
    expect(overrideRows).toBe(1);
  });

  it("reconcileFreeResponseXp writes no row when already reconciled", async () => {
    const student = await createTestUser({ role: "STUDENT" });
    // No prior free-response XP for this synthetic attempt id; a failing
    // final grade targets 0, which already matches → no-op.
    const delta = await reconcileFreeResponseXp(db, {
      attemptId: `test-vitest-frx-noop-${crypto.randomUUID()}`,
      userId: student.id,
      finalScore: 20,
    });
    expect(delta).toBe(0);
  });
});
