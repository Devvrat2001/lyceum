/**
 * course.submitReview — enrollment-gated review submission + the
 * ratingAvg/ratingCount recompute it runs in a transaction. Regressions
 * here would let a non-buyer rate a course, leak duplicate reviews per
 * student, or drift the denormalized course aggregates from the rows.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cleanupTestUsers, createTestUser } from "./helpers";

beforeAll(async () => {
  await cleanupTestUsers();
});
afterAll(async () => {
  await cleanupTestUsers();
});

async function makeCourse(ownerId: string) {
  return db.course.create({
    data: {
      slug: `test-vitest-review-${crypto.randomUUID()}`,
      title: "Reviewable Course",
      description: "Vitest fixture course.",
      subject: "math",
      grade: "6",
      authorId: ownerId,
      authorLabel: "Test Teacher",
      priceCents: 0,
      status: "PUBLISHED",
    },
  });
}

describe("course.submitReview", () => {
  it("rejects a non-enrolled student", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const course = await makeCourse(teacher.id);
    await expect(
      student.caller.course.submitReview({
        courseId: course.id,
        rating: 5,
        body: "Loved it",
      })
    ).rejects.toThrow(/enroll/i);
  });

  it("rejects the course's own author (no self-five-starring)", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const course = await makeCourse(teacher.id);
    // Authors CAN enroll in their own free course — that was the hole.
    await db.enrollment.create({
      data: { userId: teacher.id, courseId: course.id },
    });
    await expect(
      teacher.caller.course.submitReview({
        courseId: course.id,
        rating: 5,
        body: "Best course ever, definitely unbiased",
      })
    ).rejects.toThrow(/own course/i);
  });

  it("creates a review and recomputes the course aggregates", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const student = await createTestUser({ role: "STUDENT" });
    const course = await makeCourse(teacher.id);
    await db.enrollment.create({
      data: { userId: student.id, courseId: course.id },
    });

    const review = await student.caller.course.submitReview({
      courseId: course.id,
      rating: 4,
      body: "Solid course",
    });
    expect(review.rating).toBe(4);
    expect(review.reviewerName).toBeTruthy();

    const after = await db.course.findUnique({
      where: { id: course.id },
      select: { ratingAvg: true, ratingCount: true },
    });
    expect(after?.ratingCount).toBe(1);
    expect(after?.ratingAvg).toBe(4);
  });

  it("updates the existing review in place (one per student) + re-averages", async () => {
    const teacher = await createTestUser({ role: "TEACHER" });
    const studentA = await createTestUser({ role: "STUDENT" });
    const studentB = await createTestUser({ role: "STUDENT" });
    const course = await makeCourse(teacher.id);
    await db.enrollment.create({
      data: { userId: studentA.id, courseId: course.id },
    });
    await db.enrollment.create({
      data: { userId: studentB.id, courseId: course.id },
    });

    await studentA.caller.course.submitReview({
      courseId: course.id,
      rating: 2,
      body: "Meh",
    });
    await studentB.caller.course.submitReview({
      courseId: course.id,
      rating: 4,
      body: "Good",
    });
    // A resubmits — should update in place, not create a second row.
    await studentA.caller.course.submitReview({
      courseId: course.id,
      rating: 5,
      body: "Changed my mind!",
    });

    const reviews = await db.review.findMany({ where: { courseId: course.id } });
    expect(reviews).toHaveLength(2);

    const after = await db.course.findUnique({
      where: { id: course.id },
      select: { ratingAvg: true, ratingCount: true },
    });
    expect(after?.ratingCount).toBe(2);
    expect(after?.ratingAvg).toBe(4.5); // (5 + 4) / 2

    const myA = await studentA.caller.course.myReview({ courseId: course.id });
    expect(myA?.rating).toBe(5);
    expect(myA?.body).toBe("Changed my mind!");
  });
});
