/**
 * AI course-generator router (REQUIREMENTS R42 — closing a zero-coverage
 * router). The LLM is forced to demo mode so the deterministic stub
 * generators run (no AI spend, hermetic). Covers: outline generation,
 * job ownership (getJob/cancelJob), question generation + course-owner
 * authz, and saveAsCourse persisting a real Course tree.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { cleanupTestUsers, createTestUser } from "./helpers";

vi.mock("@/lib/ai/llm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/llm")>()),
  isLlmEnabled: () => false,
}));

// saveAsCourse schedules an embedding refresh via next/server `after()`,
// which has no request scope under vitest — stub it to a no-op so the
// mutation runs without reaching OpenAI.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: () => {},
}));

beforeAll(async () => {
  await cleanupTestUsers();
});
afterAll(async () => {
  await cleanupTestUsers();
});

const BRIEF = "A friendly intro to fractions for grade 6 students.";

describe("generator.outline (demo)", () => {
  it("returns a structured multi-unit outline", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const { outline } = await teacher.caller.generator.outline({ brief: BRIEF });
    expect(outline.title.length).toBeGreaterThan(0);
    expect(outline.units.length).toBeGreaterThan(0);
    expect(outline.units[0].lessons.length).toBeGreaterThan(0);
  });
});

describe("generator job ownership", () => {
  it("getJob is owner-only and 404s on a missing id", async () => {
    const owner = await createTestUser({ role: "TEACHER" });
    const intruder = await createTestUser({ role: "TEACHER" });
    const job = await db.generationJob.create({
      data: {
        userId: owner.id,
        kind: "outline",
        status: "pending",
        step: "Queued",
        input: {},
      },
    });

    const seen = await owner.caller.generator.getJob({ jobId: job.id });
    expect(seen.id).toBe(job.id);
    expect(seen.status).toBe("pending");

    await expect(
      intruder.caller.generator.getJob({ jobId: job.id })
    ).rejects.toThrow(/FORBIDDEN/);
    await expect(
      owner.caller.generator.getJob({ jobId: "does-not-exist" })
    ).rejects.toThrow(/NOT_FOUND/);
  });

  it("cancelJob flips a pending job and rejects non-owners", async () => {
    const owner = await createTestUser({ role: "TEACHER" });
    const intruder = await createTestUser({ role: "TEACHER" });
    const job = await db.generationJob.create({
      data: { userId: owner.id, kind: "outline", status: "pending", input: {} },
    });

    await expect(
      intruder.caller.generator.cancelJob({ jobId: job.id })
    ).rejects.toThrow(/FORBIDDEN/);

    const res = await owner.caller.generator.cancelJob({ jobId: job.id });
    expect(res.ok).toBe(true);
    expect(res.alreadyTerminal).toBe(false);
    const row = await db.generationJob.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(row.status).toBe("canceled");

    // A second cancel is a no-op terminal.
    const again = await owner.caller.generator.cancelJob({ jobId: job.id });
    expect(again.alreadyTerminal).toBe(true);
  });
});

describe("generator.generateQuestions (demo)", () => {
  async function makeLesson(teacherId: string) {
    const course = await db.course.create({
      data: {
        slug: `test-vitest-gen-${crypto.randomUUID()}`,
        title: "Gen Fixture",
        description: ".",
        subject: "math",
        grade: "6",
        authorId: teacherId,
        priceCents: 0,
        status: "DRAFT",
      },
    });
    const unit = await db.unit.create({
      data: { courseId: course.id, order: 1, title: "U1" },
    });
    return db.lesson.create({
      data: {
        unitId: unit.id,
        order: 1,
        title: "Fractions",
        slug: `test-vitest-gen-l-${crypto.randomUUID()}`,
      },
    });
  }

  it("persists generated questions for the course owner", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const lesson = await makeLesson(teacher.id);
    const res = await teacher.caller.generator.generateQuestions({
      lessonId: lesson.id,
      count: 3,
    });
    expect(res.added).toBeGreaterThan(0);
    const count = await db.question.count({ where: { lessonId: lesson.id } });
    expect(count).toBe(res.added);
  });

  it("forbids generating questions on another teacher's lesson", async () => {
    const owner = await createTestUser({ role: "TEACHER" });
    const intruder = await createTestUser({ role: "TEACHER" });
    const lesson = await makeLesson(owner.id);
    await expect(
      intruder.caller.generator.generateQuestions({ lessonId: lesson.id })
    ).rejects.toThrow(/FORBIDDEN/);
  });
});

describe("generator.saveAsCourse (demo)", () => {
  it("persists the outline as a DRAFT course tree owned by the teacher", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const { outline } = await teacher.caller.generator.outline({ brief: BRIEF });
    const saved = await teacher.caller.generator.saveAsCourse({
      outline,
      brief: BRIEF,
    });
    expect(saved.ok).toBe(true);

    const course = await db.course.findUniqueOrThrow({
      where: { id: saved.courseId },
      include: { units: { include: { lessons: { include: { blocks: true } } } } },
    });
    expect(course.authorId).toBe(teacher.id);
    expect(course.status).toBe("DRAFT");
    expect(course.units.length).toBe(outline.units.length);
    // Every lesson got at least one block (rich stack or READING fallback).
    const firstLesson = course.units[0].lessons[0];
    expect(firstLesson.blocks.length).toBeGreaterThan(0);
    expect(firstLesson.isPreview).toBe(true); // first lesson of first unit
  });
});
