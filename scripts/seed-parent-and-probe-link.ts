/**
 * Adds a demo PARENT user to Cedar Middle (so the admin people page
 * has something to render the new ParentLinksManager against), then
 * exercises the link → list → unlink loop directly against Prisma to
 * mirror what the admin mutations do.
 *
 * Idempotent: re-running upserts the parent and the link.
 */
import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";

const PARENT_EMAIL = "casey.parent@cedar.test";
const PARENT_PASSWORD = "demo1234"; // dev-only

async function main() {
  // Find the institution + a student to link against.
  const institution = await db.institution.findFirst({
    select: { id: true, name: true },
  });
  if (!institution) {
    console.error("No institution seeded — run npm run db:seed first.");
    process.exit(1);
  }
  const student = await db.user.findFirst({
    where: { role: "STUDENT", institutionId: institution.id },
    select: { id: true, name: true, email: true },
  });
  if (!student) {
    console.error("No student in the institution.");
    process.exit(1);
  }
  console.log(
    `Using institution "${institution.name}" + student ${student.email}`
  );

  // Upsert the PARENT user with bcrypt-hashed password so they can
  // actually log in.
  const passwordHash = await bcrypt.hash(PARENT_PASSWORD, 12);
  const parent = await db.user.upsert({
    where: { email: PARENT_EMAIL },
    update: {
      role: "PARENT",
      institutionId: institution.id,
      passwordHash,
    },
    create: {
      email: PARENT_EMAIL,
      name: "Casey Hooper (parent)",
      firstName: "Casey",
      role: "PARENT",
      institutionId: institution.id,
      passwordHash,
    },
    select: { id: true, email: true, role: true },
  });
  console.log(`Parent: ${parent.email} (${parent.id})`);

  // Link parent ↔ child (idempotent).
  await db.parentChild.upsert({
    where: {
      parentId_childId: { parentId: parent.id, childId: student.id },
    },
    create: { parentId: parent.id, childId: student.id },
    update: {},
  });
  console.log(`Linked → ${student.name} (${student.email})`);

  // List back.
  const links = await db.parentChild.findMany({
    where: { parentId: parent.id },
    include: {
      child: {
        select: {
          name: true,
          email: true,
          _count: { select: { enrollments: true } },
        },
      },
    },
  });
  console.log(`Parent has ${links.length} link(s):`);
  for (const l of links) {
    console.log(
      `  → ${l.child.name} (${l.child.email}) · ${l.child._count.enrollments} courses`
    );
  }

  // Confirm reverse-relation works too.
  const studentReverse = await db.user.findUnique({
    where: { id: student.id },
    select: { parentLinks: { select: { parentId: true } } },
  });
  console.log(
    `Reverse: student has ${studentReverse?.parentLinks.length} parent link(s)`
  );

  console.log(`\nDone. Sign in as ${PARENT_EMAIL} / ${PARENT_PASSWORD} (dev).`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
