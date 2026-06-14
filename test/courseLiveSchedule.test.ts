/**
 * Live/cohort scheduling (REQUIREMENTS R25): teacher.updateCourse sets
 * format + sessionStartsAt + sessionJoinUrl, course.bySlug returns them,
 * and switching back to self-paced clears the dangling schedule.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { anonCaller, cleanupTestUsers, createTestUser } from "./helpers";

beforeAll(async () => {
  await cleanupTestUsers();
});
afterAll(async () => {
  await cleanupTestUsers();
});

async function makeCourse(authorId: string) {
  return db.course.create({
    data: {
      slug: `test-vitest-live-${crypto.randomUUID()}`,
      title: "Live Fixture",
      description: ".",
      subject: "math",
      grade: "6",
      authorId,
      priceCents: 0,
      status: "PUBLISHED",
    },
  });
}

describe("teacher.updateCourse live scheduling", () => {
  it("sets format + schedule and bySlug returns them", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const course = await makeCourse(teacher.id);
    const startsAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);

    await teacher.caller.teacher.updateCourse({
      courseId: course.id,
      format: "live",
      sessionStartsAt: startsAt.toISOString(),
      sessionJoinUrl: "https://meet.example.test/abc",
    });

    const fetched = await anonCaller().course.bySlug({ slug: course.slug });
    expect(fetched.format).toBe("live");
    expect(fetched.sessionJoinUrl).toBe("https://meet.example.test/abc");
    expect(fetched.sessionStartsAt?.toISOString()).toBe(startsAt.toISOString());
  });

  it("switching back to self_paced clears the schedule", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const course = await makeCourse(teacher.id);
    await teacher.caller.teacher.updateCourse({
      courseId: course.id,
      format: "cohort",
      sessionStartsAt: new Date().toISOString(),
      sessionJoinUrl: "https://meet.example.test/xyz",
    });

    await teacher.caller.teacher.updateCourse({
      courseId: course.id,
      format: "self_paced",
    });

    const row = await db.course.findUniqueOrThrow({
      where: { id: course.id },
    });
    expect(row.format).toBe("self_paced");
    expect(row.sessionStartsAt).toBeNull();
    expect(row.sessionJoinUrl).toBeNull();
  });

  it("rejects an unknown format and a non-http meeting link", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const course = await makeCourse(teacher.id);
    await expect(
      teacher.caller.teacher.updateCourse({
        courseId: course.id,
        format: "webinar",
      })
    ).rejects.toThrow(/unknown format/i);
    await expect(
      teacher.caller.teacher.updateCourse({
        courseId: course.id,
        format: "live",
        sessionJoinUrl: "zoom-link-without-scheme",
      })
    ).rejects.toThrow(/http/i);
  });
});
