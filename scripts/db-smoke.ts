// Standalone DB smoke test.
// Run via:  npm run db:smoke
// (script uses node --env-file flags via package.json so .env.local loads first)
import { db } from "../src/lib/db";

async function main() {
  const r = await db.$queryRaw<{ ok: number }[]>`SELECT 1::int as ok`;
  console.log("ping:", r);
  const userCount = await db.user.count();
  const courseCount = await db.course.count();
  console.log(`users=${userCount} courses=${courseCount}`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
