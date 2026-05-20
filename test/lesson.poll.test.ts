/**
 * Smoke: `lesson.votePoll` + `lesson.pollResults`. Covers the upsert
 * (vote-changing students don't duplicate rows) and the tally
 * aggregation. `pollResults` is publicProcedure so it also gets a
 * spot-check from the anon caller.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  anonCaller,
  cleanupTestUsers,
  createTestUser,
} from "./helpers";

beforeAll(async () => {
  await cleanupTestUsers();
});
afterAll(async () => {
  await cleanupTestUsers();
});

async function freshPollBlock(teacherId: string, optionCount = 3) {
  const course = await db.course.create({
    data: {
      slug: `test-vitest-course-${crypto.randomUUID()}`,
      title: "Poll Fixture",
      description: ".",
      subject: "Math",
      grade: "6",
      authorId: teacherId,
      priceCents: 0,
      status: "DRAFT",
    },
  });
  const unit = await db.unit.create({
    data: { courseId: course.id, title: "U", order: 1 },
  });
  const lesson = await db.lesson.create({
    data: {
      unitId: unit.id,
      slug: `test-lesson-${crypto.randomUUID()}`,
      title: "L",
      order: 1,
    },
  });
  const block = await db.block.create({
    data: {
      lessonId: lesson.id,
      type: "POLL",
      order: 1,
      settings: {
        prompt: "Pick one",
        options: Array.from({ length: optionCount }, (_, i) => `Option ${i}`),
      },
    },
  });
  return { block };
}

describe("lesson.votePoll + pollResults", () => {
  it("vote writes a BlockVote + appears in tallies", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const { block } = await freshPollBlock(teacher.id);

    await student.caller.lesson.votePoll({
      blockId: block.id,
      chosenIndex: 1,
    });

    const vote = await db.blockVote.findUnique({
      where: {
        blockId_userId: { blockId: block.id, userId: student.id },
      },
    });
    expect(vote?.chosenKey).toBe("1");

    const results = await student.caller.lesson.pollResults({
      blockId: block.id,
    });
    expect(results.totalVotes).toBe(1);
    expect(results.tallies[1]).toBe(1);
    expect(results.tallies[0]).toBe(0);
    expect(results.tallies[2]).toBe(0);
    expect(results.myChoice).toBe(1);
  });

  it("re-voting upserts (no duplicate row) and re-aggregates", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const { block } = await freshPollBlock(teacher.id);

    await student.caller.lesson.votePoll({
      blockId: block.id,
      chosenIndex: 0,
    });
    await student.caller.lesson.votePoll({
      blockId: block.id,
      chosenIndex: 2,
    });

    const votes = await db.blockVote.findMany({
      where: { blockId: block.id, userId: student.id },
    });
    expect(votes).toHaveLength(1);
    expect(votes[0].chosenKey).toBe("2");

    const results = await student.caller.lesson.pollResults({
      blockId: block.id,
    });
    expect(results.totalVotes).toBe(1);
    expect(results.tallies[0]).toBe(0);
    expect(results.tallies[2]).toBe(1);
    expect(results.myChoice).toBe(2);
  });

  it("aggregates across multiple students", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const { block } = await freshPollBlock(teacher.id);

    const s1 = await createTestUser({ role: "STUDENT" });
    const s2 = await createTestUser({ role: "STUDENT" });
    const s3 = await createTestUser({ role: "STUDENT" });

    await s1.caller.lesson.votePoll({ blockId: block.id, chosenIndex: 0 });
    await s2.caller.lesson.votePoll({ blockId: block.id, chosenIndex: 0 });
    await s3.caller.lesson.votePoll({ blockId: block.id, chosenIndex: 1 });

    const results = await s1.caller.lesson.pollResults({
      blockId: block.id,
    });
    expect(results.totalVotes).toBe(3);
    expect(results.tallies[0]).toBe(2);
    expect(results.tallies[1]).toBe(1);
    expect(results.myChoice).toBe(0);
  });

  it("pollResults is anonymous-readable (myChoice is null for anon)", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const { block } = await freshPollBlock(teacher.id);

    await student.caller.lesson.votePoll({
      blockId: block.id,
      chosenIndex: 1,
    });

    const anonResults = await anonCaller().lesson.pollResults({
      blockId: block.id,
    });
    expect(anonResults.totalVotes).toBe(1);
    expect(anonResults.tallies[1]).toBe(1);
    expect(anonResults.myChoice).toBeNull();
  });

  it("rejects votePoll with chosenIndex out of range", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const { block } = await freshPollBlock(teacher.id, 3);

    await expect(
      student.caller.lesson.votePoll({
        blockId: block.id,
        chosenIndex: 5, // off the end of the 3-option poll
      })
    ).rejects.toThrow(/out of range/);
  });
});
