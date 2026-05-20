/**
 * Smoke: `teacher.addBlock` with the new optional `templateId` input.
 * Templates ship server-side resolution (single source of truth in
 * `@/lib/blockTemplates`) — a regression here would silently store
 * empty `{}` settings on every "starter" insert, which the user only
 * notices when they click the new block and find an empty inspector.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cleanupTestUsers, createTestUser } from "./helpers";
import {
  BLOCK_TEMPLATES,
  findBlockTemplate,
} from "@/lib/blockTemplates";

beforeAll(async () => {
  await cleanupTestUsers();
});
afterAll(async () => {
  await cleanupTestUsers();
});

/** Set up a Course → Unit → Lesson chain owned by the given teacher.
 *  Cascade-deletes with the teacher when cleanup runs. */
async function freshLessonFor(teacherId: string) {
  const course = await db.course.create({
    data: {
      slug: `test-vitest-course-${crypto.randomUUID()}`,
      title: "Test Course",
      description: "Vitest fixture course.",
      subject: "Math",
      grade: "6",
      authorId: teacherId,
      authorLabel: "Test Teacher",
      priceCents: 0,
      status: "DRAFT",
    },
  });
  const unit = await db.unit.create({
    data: { courseId: course.id, title: "Unit 1", order: 1 },
  });
  const lesson = await db.lesson.create({
    data: {
      unitId: unit.id,
      slug: `test-lesson-${crypto.randomUUID()}`,
      title: "Lesson 1",
      order: 1,
    },
  });
  return { course, unit, lesson };
}

describe("blockTemplates catalog", () => {
  it("findBlockTemplate returns the catalog entry by id", () => {
    const t = findBlockTemplate("mcq-4opt");
    expect(t).not.toBeNull();
    expect(t?.type).toBe("MCQ");
    expect(t?.label).toBe("4-option MCQ");
  });

  it("findBlockTemplate returns null for unknown ids", () => {
    expect(findBlockTemplate("does-not-exist")).toBeNull();
  });

  it("every catalog entry has a unique id", () => {
    const ids = BLOCK_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("teacher.addBlock with templateId", () => {
  it("seeds Block.settings from the resolved template", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const { lesson } = await freshLessonFor(teacher.id);

    const result = await teacher.caller.teacher.addBlock({
      lessonId: lesson.id,
      type: "MCQ",
      templateId: "mcq-4opt",
    });
    expect(result.ok).toBe(true);
    expect(result.block.type).toBe("MCQ");

    const persisted = await db.block.findUnique({
      where: { id: result.block.id },
    });
    const settings = (persisted?.settings ?? {}) as {
      stem?: string;
      options?: Array<{ text: string; correct: boolean }>;
    };
    expect(settings.stem).toBe("What is …?");
    expect(settings.options).toHaveLength(4);
    expect(settings.options?.[0].correct).toBe(true);
    expect(settings.options?.[1].correct).toBe(false);
  });

  it("backward-compat: omitting templateId still creates an empty block", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const { lesson } = await freshLessonFor(teacher.id);

    const result = await teacher.caller.teacher.addBlock({
      lessonId: lesson.id,
      type: "MCQ",
    });
    expect(result.ok).toBe(true);
    const persisted = await db.block.findUnique({
      where: { id: result.block.id },
    });
    expect(persisted?.settings).toEqual({});
  });

  it("rejects a templateId that doesn't match the requested type", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const { lesson } = await freshLessonFor(teacher.id);

    // mcq-4opt is an MCQ template; asking for a POLL with it should
    // throw rather than silently storing MCQ-shaped settings on a POLL
    // block (which would break the POLL inspector).
    await expect(
      teacher.caller.teacher.addBlock({
        lessonId: lesson.id,
        type: "POLL",
        templateId: "mcq-4opt",
      })
    ).rejects.toThrow(/MCQ, not POLL/);
  });

  it("rejects an unknown templateId", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const { lesson } = await freshLessonFor(teacher.id);

    await expect(
      teacher.caller.teacher.addBlock({
        lessonId: lesson.id,
        type: "MCQ",
        templateId: "no-such-template",
      })
    ).rejects.toThrow(/Unknown template/);
  });

  it("a foreign teacher cannot addBlock to another teacher's lesson", async () => {
    const owner = await createTestUser({ role: "TEACHER" });
    const thief = await createTestUser({ role: "TEACHER" });
    const { lesson } = await freshLessonFor(owner.id);

    await expect(
      thief.caller.teacher.addBlock({
        lessonId: lesson.id,
        type: "MCQ",
        templateId: "mcq-4opt",
      })
    ).rejects.toThrow(/FORBIDDEN/);
  });
});
