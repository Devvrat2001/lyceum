// Seeds LessonChunk rows for the three demo lesson slugs so the
// AI tutor's citations point at real, search-able passages.
//
// Run: npm run db:seed-chunks
import { config as loadDotenv } from "dotenv";
loadDotenv({ path: ".env.local", override: true });
loadDotenv({ path: ".env" });

import { db } from "@/lib/db";

type Chunk = { page: number; section: string; content: string };

const CHUNKS_BY_LESSON_SLUG: Record<string, Chunk[]> = {
  "multiplying-fractions": [
    {
      page: 140,
      section: "Definition",
      content:
        "A fraction names a part of a whole. The denominator (bottom) tells you how many equal parts the whole has been divided into, and the numerator (top) tells you how many of those parts you have.",
    },
    {
      page: 141,
      section: "Worked example",
      content:
        "To multiply a fraction by a whole number, multiply the whole number by the numerator and keep the denominator the same. For example, 4 × (3/8) means you have 4 groups of 3 eighths each, which is 12 eighths or 12/8.",
    },
    {
      page: 142,
      section: "Pizza model",
      content:
        "Imagine 4 identical pizzas, each cut into 8 equal slices. If Maya eats 3 slices from each pizza, she eats 3 + 3 + 3 + 3 = 12 slices in total. This is the same as 4 × 3 = 12, and it is exactly what 4 × (3/8) computes: 12 eighths of a pizza.",
    },
    {
      page: 143,
      section: "Why multiplication, not addition",
      content:
        "Multiplication is repeated addition. 4 × 3 means add three four times. When you multiply a whole number by a fraction, you are adding that fraction to itself that many times. This is why 4 × (3/8) gives 12/8 — you're stacking 3/8 four times in a row.",
    },
    {
      page: 144,
      section: "Simplifying",
      content:
        "After multiplying, simplify by dividing the numerator and denominator by any common factor. 12/8 simplifies to 3/2 (dividing both by 4), which can also be written as the mixed number 1 1/2. Three halves means one and a half whole pizzas.",
    },
    {
      page: 145,
      section: "Common mistakes",
      content:
        "Do not multiply both the numerator and the denominator by the whole number — only the numerator. Multiplying both would shrink the fraction's value instead of growing it. Always keep the denominator of the original fraction unchanged.",
    },
  ],
  "water-cycle": [
    {
      page: 88,
      section: "Overview",
      content:
        "The water cycle is the continuous movement of water on, above, and below the surface of the Earth. The four main processes are evaporation, condensation, precipitation, and collection.",
    },
    {
      page: 89,
      section: "Evaporation",
      content:
        "Evaporation is the process by which liquid water from oceans, lakes, and rivers turns into water vapor due to heat from the sun. This is the primary way water leaves the Earth's surface and enters the atmosphere.",
    },
    {
      page: 90,
      section: "Condensation",
      content:
        "When water vapor in the atmosphere cools as it rises, it turns back into tiny liquid water droplets that form clouds. This change from gas to liquid is called condensation.",
    },
    {
      page: 91,
      section: "Precipitation",
      content:
        "When the water droplets in clouds combine and grow heavy enough, they fall to Earth as rain, snow, sleet, or hail. This step is called precipitation, and it returns water to the surface.",
    },
    {
      page: 92,
      section: "Collection",
      content:
        "Once precipitation reaches the ground, water collects in oceans, lakes, rivers, and underground aquifers. From here, the cycle begins again with evaporation.",
    },
  ],
  "bridge-to-terabithia": [
    {
      page: 56,
      section: "Chapter 5 summary",
      content:
        "In Chapter 5, Jess and Leslie discover a creek running through the woods behind their houses. They swing across on an old rope to a small piece of land they decide to call Terabithia, their secret kingdom.",
    },
    {
      page: 57,
      section: "Symbolism of the rope bridge",
      content:
        "The rope swing across the creek is more than just a way to cross water. It represents the passage from the mundane everyday world into the imaginative one Jess and Leslie build together. Crossing the rope means leaving real life — and its hardships — behind.",
    },
    {
      page: 58,
      section: "Theme: imagination as refuge",
      content:
        "Terabithia is a refuge from the difficulties of fifth grade: bullying, family tension, and the pressure to fit in. By building an imagined world together, Jess and Leslie take control of one space where they get to make all the rules.",
    },
    {
      page: 59,
      section: "Character development",
      content:
        "Leslie's confidence in inventing Terabithia gives Jess permission to be creative in ways he has previously hidden. By the end of the chapter, the bond between them deepens from a school friendship into something closer to a real partnership.",
    },
  ],
};

async function main() {
  console.log("→ Seeding lesson chunks…");
  let total = 0;
  for (const [slug, chunks] of Object.entries(CHUNKS_BY_LESSON_SLUG)) {
    const lesson = await db.lesson.findFirst({
      where: { slug },
      select: { id: true, title: true },
    });
    if (!lesson) {
      console.log(`  ! lesson not found: ${slug} — skipping`);
      continue;
    }
    await db.lessonChunk.deleteMany({ where: { lessonId: lesson.id } });
    await db.lessonChunk.createMany({
      data: chunks.map((c) => ({
        lessonId: lesson.id,
        page: c.page,
        section: c.section,
        content: c.content,
      })),
    });
    console.log(`  ${slug} → ${chunks.length} chunks`);
    total += chunks.length;
  }
  console.log(`✅ seeded ${total} chunks`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
