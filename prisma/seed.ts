// Idempotent seed script.
// Re-run safely with: npm run db:seed
//
// Migrates every hardcoded const array from the prototype:
//   - src/app/page.tsx                FEATURED, PATHS, TEACHERS, RECOMMENDATIONS
//   - src/app/course/[slug]/page.tsx  COURSES (4 entries)
//   - src/app/student/page.tsx        SKILLS, ASSIGNMENTS, LEADERBOARD, BADGES
//   - src/app/student/skill-tree/page.tsx  NODES, LINKS
//   - src/app/student/lesson/[lessonId]/page.tsx  LESSONS (3 entries), STEPS

import { db } from "../src/lib/db";

async function main() {
  console.log("→ Seeding Lyceum…");

  // ── Institution + Class ──
  const institution = await db.institution.upsert({
    where: { slug: "cedar-middle" },
    update: {},
    create: {
      slug: "cedar-middle",
      name: "Cedar Middle",
      plan: "SCHOOL",
      seats: 320,
    },
  });

  // ── Admin ──
  await db.user.upsert({
    where: { email: "admin@cedar.test" },
    update: {
      firstName: "Pat",
      name: "Pat Hooper",
      role: "ADMIN",
      institutionId: institution.id,
    },
    create: {
      email: "admin@cedar.test",
      firstName: "Pat",
      name: "Pat Hooper",
      role: "ADMIN",
      institutionId: institution.id,
    },
  });

  // ── Teachers (5 + 4 marketplace teachers) ──
  const teacherSeeds = [
    { email: "reyes@cedar.test", firstName: "Patricia", name: "Mrs. Reyes" },
    { email: "jacobs@cedar.test", firstName: "Marcus", name: "Mr. Jacobs" },
    { email: "chen@cedar.test", firstName: "Lin", name: "Ms. Chen" },
    { email: "lopez@cedar.test", firstName: "Roberto", name: "Sr. López" },
    { email: "adeyemi@cedar.test", firstName: "Tunde", name: "Mr. Adeyemi" },
    {
      email: "khan-edu@lyceum.test",
      firstName: "Khan",
      name: "Khan Edu Group",
    },
    { email: "studio-pi@lyceum.test", firstName: "Studio", name: "Studio Pi" },
    {
      email: "lyceum-school@lyceum.test",
      firstName: "Lyceum",
      name: "Lyceum School",
    },
  ];
  const teachers = new Map<string, { id: string }>();
  for (const t of teacherSeeds) {
    const u = await db.user.upsert({
      where: { email: t.email },
      update: { name: t.name, firstName: t.firstName, role: "TEACHER" },
      create: {
        email: t.email,
        firstName: t.firstName,
        name: t.name,
        role: "TEACHER",
        institutionId: institution.id,
      },
    });
    teachers.set(t.name, { id: u.id });
  }

  // ── Class 6B ──
  const classBee = await db.class.upsert({
    where: {
      institutionId_name: { institutionId: institution.id, name: "6B" },
    },
    update: { teacherId: teachers.get("Mrs. Reyes")!.id },
    create: {
      institutionId: institution.id,
      name: "6B",
      teacherId: teachers.get("Mrs. Reyes")!.id,
    },
  });

  // ── Demo student "Jordan Riley" ──
  const jordan = await db.user.upsert({
    where: { email: "jordan@cedar.test" },
    update: {
      firstName: "Jordan",
      name: "Jordan Riley",
      institutionId: institution.id,
      classId: classBee.id,
    },
    create: {
      email: "jordan@cedar.test",
      firstName: "Jordan",
      name: "Jordan Riley",
      role: "STUDENT",
      institutionId: institution.id,
      classId: classBee.id,
    },
  });

  // Other classmates for the leaderboard
  const classmates = [
    { email: "maya@cedar.test", firstName: "Maya", name: "Maya P.", xp: 920 },
    { email: "alex@cedar.test", firstName: "Alex", name: "Alex K.", xp: 870 },
    { email: "sam@cedar.test", firstName: "Sam", name: "Sam D.", xp: 690 },
    { email: "riya@cedar.test", firstName: "Riya", name: "Riya N.", xp: 620 },
  ];
  const classmateUsers = [];
  for (const c of classmates) {
    const u = await db.user.upsert({
      where: { email: c.email },
      update: {
        firstName: c.firstName,
        name: c.name,
        institutionId: institution.id,
        classId: classBee.id,
      },
      create: {
        email: c.email,
        firstName: c.firstName,
        name: c.name,
        role: "STUDENT",
        institutionId: institution.id,
        classId: classBee.id,
      },
    });
    classmateUsers.push({ user: u, xp: c.xp });
  }

  // Seed XP events for classmates so leaderboard has real data
  for (const cm of classmateUsers) {
    await db.xPEvent.deleteMany({
      where: { userId: cm.user.id, source: "seed" },
    });
    await db.xPEvent.create({
      data: { userId: cm.user.id, points: cm.xp, source: "seed" },
    });
  }
  // Jordan's XP: 740 weekly + 1740 historic for total of ~2480
  await db.xPEvent.deleteMany({
    where: { userId: jordan.id, source: "seed" },
  });
  await db.xPEvent.createMany({
    data: [
      { userId: jordan.id, points: 740, source: "seed" },
      { userId: jordan.id, points: 1740, source: "seed_historic" },
    ],
  });

  // Streak
  await db.streak.upsert({
    where: { userId: jordan.id },
    update: { current: 14, longest: 14, lastDay: new Date() },
    create: {
      userId: jordan.id,
      current: 14,
      longest: 14,
      lastDay: new Date(),
    },
  });

  // ── Badges ──
  const badgeSeeds = [
    {
      slug: "hot-streak",
      name: "Hot Streak",
      icon: "flame",
      rule: { type: "streak", days: 7 },
    },
    {
      slug: "first-quiz-ace",
      name: "First Quiz Ace",
      icon: "star",
      rule: { type: "quiz", perfectScores: 1 },
    },
    {
      slug: "five-books",
      name: "5 Books",
      icon: "book",
      rule: { type: "reading", booksFinished: 5 },
    },
  ];
  for (const b of badgeSeeds) {
    const badge = await db.badge.upsert({
      where: { slug: b.slug },
      update: { name: b.name, icon: b.icon, rule: b.rule },
      create: b,
    });
    await db.userBadge.upsert({
      where: { userId_badgeId: { userId: jordan.id, badgeId: badge.id } },
      update: {},
      create: { userId: jordan.id, badgeId: badge.id },
    });
  }

  // ── Skills (for the skill tree) ──
  const skillSeeds = [
    { slug: "whole-numbers", title: "Whole Numbers", col: 0, row: 1 },
    { slug: "place-value", title: "Place Value", col: 0, row: 3 },
    { slug: "add-subtract", title: "Add & Subtract", col: 1, row: 0 },
    { slug: "mult-facts", title: "Multiplication Facts", col: 1, row: 2 },
    { slug: "decimals", title: "Decimals", col: 1, row: 4 },
    { slug: "long-division", title: "Long Division", col: 2, row: 1 },
    { slug: "intro-fractions", title: "Intro to Fractions", col: 2, row: 3 },
    { slug: "equiv-fractions", title: "Equivalent Fractions", col: 3, row: 0 },
    { slug: "fraction-x-whole", title: "Fraction × Whole", col: 3, row: 2 },
    {
      slug: "decimals-fractions",
      title: "Decimals ↔ Fractions",
      col: 3,
      row: 4,
    },
    { slug: "fraction-x-fraction", title: "Fraction × Fraction", col: 4, row: 1 },
    { slug: "mixed-numbers", title: "Mixed Numbers", col: 4, row: 3 },
    {
      slug: "ratios-proportions",
      title: "Ratios & Proportions",
      col: 5,
      row: 2,
      isBoss: true,
    },
  ];
  const skillsBySlug = new Map<string, { id: string }>();
  for (const s of skillSeeds) {
    const sk = await db.skill.upsert({
      where: { slug: s.slug },
      update: s,
      create: s,
    });
    skillsBySlug.set(s.slug, { id: sk.id });
  }

  const edges: [string, string][] = [
    ["whole-numbers", "add-subtract"],
    ["whole-numbers", "mult-facts"],
    ["place-value", "mult-facts"],
    ["place-value", "decimals"],
    ["add-subtract", "long-division"],
    ["mult-facts", "long-division"],
    ["mult-facts", "intro-fractions"],
    ["decimals", "intro-fractions"],
    ["long-division", "equiv-fractions"],
    ["long-division", "fraction-x-whole"],
    ["intro-fractions", "fraction-x-whole"],
    ["intro-fractions", "decimals-fractions"],
    ["equiv-fractions", "fraction-x-fraction"],
    ["fraction-x-whole", "fraction-x-fraction"],
    ["fraction-x-whole", "mixed-numbers"],
    ["decimals-fractions", "mixed-numbers"],
    ["fraction-x-fraction", "ratios-proportions"],
    ["mixed-numbers", "ratios-proportions"],
  ];
  for (const [from, to] of edges) {
    const fromId = skillsBySlug.get(from)!.id;
    const toId = skillsBySlug.get(to)!.id;
    await db.skillEdge.upsert({
      where: { fromId_toId: { fromId, toId } },
      update: {},
      create: { fromId, toId },
    });
  }

  // Mastery: first 7 skills "done", next 3 in progress (sim wireframe)
  const masteryLevels: Record<string, number> = {
    "whole-numbers": 1,
    "place-value": 1,
    "add-subtract": 1,
    "mult-facts": 1,
    "decimals": 1,
    "long-division": 1,
    "intro-fractions": 1,
    "equiv-fractions": 0.6,
    "fraction-x-whole": 0.4,
    "decimals-fractions": 0.1,
  };
  for (const [slug, level] of Object.entries(masteryLevels)) {
    const skillId = skillsBySlug.get(slug)!.id;
    await db.mastery.upsert({
      where: { userId_skillId: { userId: jordan.id, skillId } },
      update: { level },
      create: { userId: jordan.id, skillId, level },
    });
  }

  // ── Courses (4 from prototype's COURSES const) ──
  type Lesson = {
    slug?: string;
    order: number;
    title: string;
    durationMin?: number;
    isPreview?: boolean;
    intro?: string;
    questions?: {
      stem: string;
      answers: { key: string; text: string; correct: boolean }[];
      difficulty?: number;
    }[];
    steps?: { title: string; durationLabel: string; isAi?: boolean }[];
  };
  type Unit = {
    order: number;
    title: string;
    subtitle?: string;
    estLabel?: string;
    lessons: Lesson[];
  };
  type CourseSeed = {
    slug: string;
    title: string;
    tagline: string;
    description: string;
    teacherName: string;
    authorLabel: string;
    subject: string;
    grade: string;
    format?: string; // delivery format; defaults to "self_paced" when omitted
    priceCents: number;
    rating: number;
    ratingCount: number;
    enrollCount: number;
    tag: string;
    aiHint: string;
    upgradeNote: string;
    learnOutcomes: string[];
    units: Unit[];
  };

  const FRACTIONS_LESSON: Lesson = {
    slug: "multiplying-fractions",
    order: 5,
    title: "Multiplying Fractions by Whole Numbers",
    durationMin: 35,
    isPreview: false,
    intro:
      '"3⁄8" means 3 slices out of 8. There are 4 pizzas, so we add Maya\'s 3 slices for each pizza.',
    questions: [
      {
        stem: "A pizza is cut into 8 equal slices. Maya eats 3⁄8 of the pizza. If there are 4 pizzas, how many slices does she eat?",
        difficulty: 2,
        answers: [
          { key: "A", text: "7 slices", correct: false },
          { key: "B", text: "11 slices", correct: false },
          { key: "C", text: "12 slices", correct: true },
          { key: "D", text: "15 slices", correct: false },
        ],
      },
    ],
    steps: [
      { title: "Warm-up: Recall", durationLabel: "2 min" },
      { title: "Concept video", durationLabel: "6 min" },
      { title: "Worked example", durationLabel: "4 min" },
      { title: "Practice · 8 Qs", durationLabel: "10 min" },
      { title: "Mini-game: Pizza Slices", durationLabel: "5 min", isAi: true },
      { title: "Check for understanding", durationLabel: "4 min" },
      { title: "Reflect & summarize", durationLabel: "3 min" },
    ],
  };

  const WATER_LESSON: Lesson = {
    slug: "water-cycle",
    order: 3,
    title: "The Water Cycle: Evaporation",
    durationMin: 18,
    intro:
      "Heat from the sun changes liquid water into vapor — this is evaporation, the entry point to the cycle.",
    questions: [
      {
        stem: "Which step in the water cycle adds water vapor to the atmosphere from oceans and lakes?",
        answers: [
          { key: "A", text: "Condensation", correct: false },
          { key: "B", text: "Precipitation", correct: false },
          { key: "C", text: "Evaporation", correct: true },
          { key: "D", text: "Runoff", correct: false },
        ],
      },
    ],
  };

  const READING_LESSON: Lesson = {
    slug: "bridge-to-terabithia",
    order: 5,
    title: "Bridge to Terabithia — Chapter 5",
    durationMin: 12,
    intro:
      "The rope bridge is a threshold — a small, ordinary object made magical by the meaning the kids assign to it.",
    questions: [
      {
        stem: "What does the rope bridge symbolize for Jess and Leslie in this chapter?",
        answers: [
          { key: "A", text: "A way to skip school", correct: false },
          {
            key: "B",
            text: "Their passage into a private, imaginative world",
            correct: true,
          },
          { key: "C", text: "A shortcut home", correct: false },
          { key: "D", text: "A test of physical strength", correct: false },
        ],
      },
    ],
  };

  const COURSE_SEEDS: CourseSeed[] = [
    {
      slug: "fractions-decimals-percents",
      title: "Fractions, Decimals & Percents — fluency for Grade 6",
      tagline: "BESTSELLER · 12,400 students",
      description:
        "Build deep fluency across the three core forms. 38 short lessons, 120+ adaptive practice questions, 6 mini-games, and an AI tutor that knows every problem.",
      teacherName: "Khan Edu Group",
      authorLabel: "Khan Edu Group",
      subject: "math",
      grade: "6",
      priceCents: 0,
      rating: 4.9,
      ratingCount: 2184,
      enrollCount: 12400,
      tag: "BESTSELLER",
      aiHint: "AI says: matches your skill level — start at Unit 2",
      upgradeNote: "Or upgrade for certificates · $19",
      learnOutcomes: [
        "Convert fluently between fractions, decimals, percents",
        "Add, subtract, multiply, divide fractions",
        "Apply percents to discounts, taxes, tips",
        "Estimate using benchmarks (½, ¼, 10%)",
        "Solve word problems with multi-step reasoning",
        "Pass the Grade 6 unit test with 90%+",
      ],
      units: [
        {
          order: 1,
          title: "What is a fraction?",
          estLabel: "6 lessons · 1h 50m",
          lessons: [
            { order: 1, title: "Halves, thirds, fourths", isPreview: true },
            { order: 2, title: "Number line basics" },
            { order: 3, title: "Equivalent fractions" },
            { order: 4, title: "Comparing fractions" },
            { order: 5, title: "Practice quiz" },
            { order: 6, title: "Mini-game: Pizza math" },
          ],
        },
        {
          order: 2,
          title: "Operations with fractions",
          estLabel: "9 lessons · 3h 10m",
          lessons: [
            { order: 1, title: "Adding fractions" },
            { order: 2, title: "Subtracting fractions" },
            { order: 3, title: "Multiplying fractions, intuitively" },
            { order: 4, title: "Multiplying fractions, formally" },
            FRACTIONS_LESSON,
          ],
        },
        {
          order: 3,
          title: "Decimals & place value",
          estLabel: "7 lessons · 2h 20m",
          lessons: [{ order: 1, title: "What's after the decimal?" }],
        },
        {
          order: 4,
          title: "Percents in real life",
          estLabel: "8 lessons · 2h 40m",
          lessons: [{ order: 1, title: "Discounts and sales tax" }],
        },
        {
          order: 5,
          title: "Putting it together · project",
          estLabel: "8 lessons · 2h 40m",
          lessons: [{ order: 1, title: "Cookie recipe x2 — capstone" }],
        },
      ],
    },
    {
      slug: "algebra-foundations",
      title: "Algebra Foundations — Grade 6",
      tagline: "NEW · 8,100 students",
      description:
        "From 'what's a variable?' to expressions and equations. Visual, friendly, and capped with a real-world capstone project.",
      teacherName: "Mr. Adeyemi",
      authorLabel: "Mr. Adeyemi",
      subject: "math",
      grade: "6",
      priceCents: 49900,
      rating: 4.8,
      ratingCount: 1204,
      enrollCount: 8100,
      tag: "NEW",
      aiHint: "AI says: pace yourself — try 2 lessons per week",
      upgradeNote: "One-time · Lifetime access",
      learnOutcomes: [
        "Read and write expressions with variables",
        "Evaluate expressions for given values",
        "Solve one- and two-step equations",
        "Translate word problems to algebra",
        "Apply algebra to budgeting & rates",
        "Build confidence with visual models",
      ],
      units: [
        {
          order: 1,
          title: "What is a variable?",
          estLabel: "4 lessons · 1.5 hr",
          lessons: [
            { order: 1, title: "Why letters?", isPreview: true },
            { order: 2, title: "Spot the variable" },
            { order: 3, title: "AI roleplay: explain to a 4th grader" },
            { order: 4, title: "Check for understanding" },
          ],
        },
        { order: 2, title: "Expressions & evaluating", estLabel: "6 lessons · 2 hr", lessons: [{ order: 1, title: "Order of operations recap" }] },
        { order: 3, title: "One-step equations", estLabel: "5 lessons · 1.5 hr", lessons: [{ order: 1, title: "Visual balance" }] },
        { order: 4, title: "Two-step equations", estLabel: "5 lessons · 2 hr", lessons: [{ order: 1, title: "Undo, undo" }] },
        { order: 5, title: "Capstone · grocery budget", estLabel: "4 lessons · 1.5 hr", lessons: [{ order: 1, title: "Model your week's spend" }] },
      ],
    },
    {
      slug: "geometry-origami",
      title: "Geometry Through Origami",
      tagline: "INTERACTIVE · 3,200 students",
      description:
        "A hands-on geometry course that uses paper folding to teach angles, congruence, and symmetry. Fold, cut, and discover.",
      teacherName: "Studio Pi",
      authorLabel: "Studio Pi",
      subject: "math",
      grade: "6",
      format: "live",
      priceCents: 99900,
      rating: 4.9,
      ratingCount: 612,
      enrollCount: 3200,
      tag: "INTERACTIVE",
      aiHint: "AI says: companion to your geometry strand · perfect fit",
      upgradeNote: "Includes printable starter pack",
      learnOutcomes: [
        "Identify angles and their properties through folding",
        "Recognize congruent shapes by symmetry",
        "Tessellate the plane with regular polygons",
        "Build modular polyhedra",
      ],
      units: [
        { order: 1, title: "Angles you can fold", estLabel: "5 lessons · 2 hr", lessons: [{ order: 1, title: "Crease, mountain, valley" }] },
        { order: 2, title: "Congruence by symmetry", estLabel: "4 lessons · 1.5 hr", lessons: [{ order: 1, title: "Reflective symmetry" }] },
        { order: 3, title: "Tessellations & polygons", estLabel: "6 lessons · 2.5 hr", lessons: [{ order: 1, title: "Tiling the plane" }] },
        { order: 4, title: "Modular constructions", estLabel: "4 lessons · 2 hr", lessons: [{ order: 1, title: "Sonobe units" }] },
      ],
    },
    {
      slug: "math-olympiad-prep",
      title: "Math Olympiad Prep · Beginner",
      tagline: "CHALLENGE · 2,000 students",
      description:
        "Stretch your strongest students. Each lesson is a hand-picked competition problem with a guided solution and a stretch variant.",
      teacherName: "Lyceum School",
      authorLabel: "Lyceum School",
      subject: "math",
      grade: "6",
      format: "cohort",
      priceCents: 149900,
      rating: 4.7,
      ratingCount: 401,
      enrollCount: 2000,
      tag: "CHALLENGE",
      aiHint:
        "AI says: stretch level — try after you finish Algebra Foundations",
      upgradeNote: "Includes 1 mock olympiad with AI feedback",
      learnOutcomes: [
        "Solve classic AMC 8 style problems",
        "Pattern hunt and conjecture",
        "Use modular arithmetic on contest problems",
        "Time yourself on a mock olympiad",
      ],
      units: [
        { order: 1, title: "Counting & combinatorics", estLabel: "6 problems", lessons: [{ order: 1, title: "Stars and bars" }] },
        { order: 2, title: "Number theory basics", estLabel: "8 problems", lessons: [{ order: 1, title: "Divisibility rules" }] },
        { order: 3, title: "Geometric reasoning", estLabel: "6 problems", lessons: [{ order: 1, title: "Angle chasing" }] },
        { order: 4, title: "Mock olympiad", estLabel: "1 timed set", lessons: [{ order: 1, title: "Mock #1" }] },
      ],
    },
    // Bonus 5th course for the science / ELA lessons
    {
      slug: "earth-science-grade-6",
      title: "Earth Science · Grade 6",
      tagline: "POPULAR · 4,200 students",
      description:
        "From the water cycle to the rock cycle, with hands-on labs and AI-graded lab reports.",
      teacherName: "Mrs. Reyes",
      authorLabel: "Mrs. Reyes · Cedar Middle",
      subject: "science",
      grade: "6",
      priceCents: 0,
      rating: 4.6,
      ratingCount: 380,
      enrollCount: 4200,
      tag: "POPULAR",
      aiHint: "AI says: matches your current science strand",
      upgradeNote: "Free for institution students",
      learnOutcomes: [
        "Explain the water cycle",
        "Identify rocks and minerals",
        "Read a topographic map",
      ],
      units: [
        {
          order: 1,
          title: "Earth's systems",
          estLabel: "6 lessons · 2 hr",
          lessons: [{ order: 1, title: "Spheres of Earth" }],
        },
        {
          order: 2,
          title: "The Water Cycle",
          estLabel: "5 lessons · 1.5 hr",
          lessons: [
            { order: 1, title: "Why does it rain?" },
            { order: 2, title: "Where does the water go?" },
            WATER_LESSON,
          ],
        },
      ],
    },
    {
      slug: "ela-grade-6-novels",
      title: "ELA Grade 6 · Novel Studies",
      tagline: "TEACHER PICK · 1,900 students",
      description:
        "Three full novels with discussion guides, AI Socratic partner, and one capstone essay.",
      teacherName: "Ms. Chen",
      authorLabel: "Ms. Chen",
      subject: "ela",
      grade: "6",
      priceCents: 0,
      rating: 4.8,
      ratingCount: 220,
      enrollCount: 1900,
      tag: "TEACHER PICK",
      aiHint: "AI says: pairs well with your reading log",
      upgradeNote: "Free with class enrollment",
      learnOutcomes: [
        "Annotate fiction for theme",
        "Track character arcs",
        "Write a 5-paragraph literary essay",
      ],
      units: [
        {
          order: 1,
          title: "Bridge to Terabithia",
          estLabel: "10 lessons · 4 hr",
          lessons: [
            { order: 1, title: "Setting the stage" },
            { order: 2, title: "Meeting Leslie" },
            { order: 3, title: "Building Terabithia" },
            { order: 4, title: "The first crossing" },
            READING_LESSON,
          ],
        },
      ],
    },
  ];

  for (const c of COURSE_SEEDS) {
    const author = teachers.get(c.teacherName)!;
    const course = await db.course.upsert({
      where: { slug: c.slug },
      update: {
        title: c.title,
        tagline: c.tagline,
        description: c.description,
        authorId: author.id,
        authorLabel: c.authorLabel,
        subject: c.subject,
        grade: c.grade,
        format: c.format ?? "self_paced",
        status: "PUBLISHED",
        priceCents: c.priceCents,
        ratingAvg: c.rating,
        ratingCount: c.ratingCount,
        enrollCount: c.enrollCount,
        tag: c.tag,
        aiHint: c.aiHint,
        upgradeNote: c.upgradeNote,
        learnOutcomes: c.learnOutcomes,
        publishedAt: new Date(),
      },
      create: {
        slug: c.slug,
        title: c.title,
        tagline: c.tagline,
        description: c.description,
        authorId: author.id,
        authorLabel: c.authorLabel,
        subject: c.subject,
        grade: c.grade,
        format: c.format ?? "self_paced",
        status: "PUBLISHED",
        priceCents: c.priceCents,
        ratingAvg: c.rating,
        ratingCount: c.ratingCount,
        enrollCount: c.enrollCount,
        tag: c.tag,
        aiHint: c.aiHint,
        upgradeNote: c.upgradeNote,
        learnOutcomes: c.learnOutcomes,
        publishedAt: new Date(),
      },
    });

    // Wipe and reseed units (so seed remains idempotent for content changes)
    await db.unit.deleteMany({ where: { courseId: course.id } });

    for (const u of c.units) {
      const unit = await db.unit.create({
        data: {
          courseId: course.id,
          order: u.order,
          title: u.title,
          subtitle: u.subtitle,
          estLabel: u.estLabel,
        },
      });

      for (const l of u.lessons) {
        const lesson = await db.lesson.create({
          data: {
            unitId: unit.id,
            // Every lesson needs a slug: the student reader route is
            // `/student/lesson/[slug]` and the curriculum only renders
            // a lesson as a clickable link when it has one. Lessons
            // without an explicit demo slug get a deterministic
            // `<course>-u<unit>-l<lesson>` slug (same scheme the AI
            // course generator uses), so a freshly seeded course is
            // fully navigable instead of a wall of dead links.
            slug: l.slug ?? `${c.slug}-u${u.order}-l${l.order}`,
            order: l.order,
            title: l.title,
            durationMin: l.durationMin,
            isPreview: l.isPreview ?? false,
            intro: l.intro,
          },
        });

        if (l.questions) {
          for (const [i, q] of l.questions.entries()) {
            await db.question.create({
              data: {
                lessonId: lesson.id,
                order: i + 1,
                stem: q.stem,
                difficulty: q.difficulty ?? 2,
                answers: q.answers,
              },
            });
          }
        }

        if (l.steps) {
          for (const [i, s] of l.steps.entries()) {
            await db.lessonStep.create({
              data: {
                lessonId: lesson.id,
                order: i + 1,
                title: s.title,
                durationLabel: s.durationLabel,
                isAi: s.isAi ?? false,
              },
            });
          }
        }
      }
    }
  }

  // Reviews on the bestseller course
  const bestseller = await db.course.findUniqueOrThrow({
    where: { slug: "fractions-decimals-percents" },
  });
  await db.review.deleteMany({
    where: { courseId: bestseller.id, reviewerName: { not: null } },
  });
  await db.review.createMany({
    data: [
      {
        userId: jordan.id,
        courseId: bestseller.id,
        rating: 5,
        body: "My daughter actually asks to do math now. The AI tutor is patient and gentle.",
        reviewerName: "Sarah M.",
        reviewerRole: "Parent · Grade 6",
      },
      {
        userId: jordan.id,
        courseId: bestseller.id,
        rating: 5,
        body: "I assign units of this directly into my class. Saves me 5 hrs of prep a week.",
        reviewerName: "Mr. Davis",
        reviewerRole: "Teacher · Cedar Middle",
      },
    ],
  });

  // Enrollments for Jordan in the 3 "continue learning" courses
  const continueCourses = [
    { slug: "fractions-decimals-percents", progressPct: 58 },
    { slug: "earth-science-grade-6", progressPct: 33 },
    { slug: "ela-grade-6-novels", progressPct: 80 },
  ];
  for (const cc of continueCourses) {
    const c = await db.course.findUnique({ where: { slug: cc.slug } });
    if (!c) continue;
    await db.enrollment.upsert({
      where: { userId_courseId: { userId: jordan.id, courseId: c.id } },
      update: {
        progressPct: cc.progressPct,
        lastActivityAt: new Date(),
      },
      create: {
        userId: jordan.id,
        courseId: c.id,
        progressPct: cc.progressPct,
        lastActivityAt: new Date(),
      },
    });
  }

  // ── Paths ──
  const pathSeeds = [
    {
      slug: "full-year-grade-6-math",
      title: "Full Year · 6th Grade Math",
      subtitle: "12 courses · 84 lessons",
      priceCents: 299900,
      saveLabel: "Save 38%",
      courseSlugs: ["fractions-decimals-percents", "algebra-foundations", "geometry-origami"],
    },
    {
      slug: "young-coder",
      title: "Young Coder · Scratch → Python",
      subtitle: "6 courses · 40 hrs",
      priceCents: 199900,
      saveLabel: "Save 30%",
      courseSlugs: [],
    },
    {
      slug: "reading-confident",
      title: "Reading Confident · Ch. Books",
      subtitle: "8 books · AI discussion",
      priceCents: 149900,
      saveLabel: "Save 25%",
      courseSlugs: ["ela-grade-6-novels"],
    },
  ];
  for (const p of pathSeeds) {
    const path = await db.path.upsert({
      where: { slug: p.slug },
      update: {
        title: p.title,
        subtitle: p.subtitle,
        priceCents: p.priceCents,
        saveLabel: p.saveLabel,
      },
      create: {
        slug: p.slug,
        title: p.title,
        subtitle: p.subtitle,
        priceCents: p.priceCents,
        saveLabel: p.saveLabel,
      },
    });
    await db.pathCourse.deleteMany({ where: { pathId: path.id } });
    for (const [i, slug] of p.courseSlugs.entries()) {
      const c = await db.course.findUnique({ where: { slug } });
      if (!c) continue;
      await db.pathCourse.create({
        data: { pathId: path.id, courseId: c.id, order: i + 1 },
      });
    }
  }

  // ── Notifications for Jordan ──
  await db.notification.deleteMany({ where: { userId: jordan.id } });
  await db.notification.createMany({
    data: [
      {
        userId: jordan.id,
        kind: "assignment_due",
        title: "Fractions Quiz due tomorrow",
        body: "Mrs. Reyes assigned a quiz · 50 XP",
        href: "/student/lesson/multiplying-fractions",
      },
      {
        userId: jordan.id,
        kind: "badge_earned",
        title: "🔥 Hot Streak — 14 days",
        body: "You've practiced 14 days in a row",
      },
      {
        userId: jordan.id,
        kind: "ai_tip",
        title: "AI tip from your tutor",
        body: "You're 1 quiz away from unlocking Fractions III",
      },
    ],
  });

  // ── Phase 3: paid Orders + Stripe Connect state ──
  // Seeds a populated earnings page for the marketplace teachers.
  // Idempotent: every Order has a deterministic externalId so re-running
  // the seed upserts cleanly. Fee = 15% (matches STRIPE_PLATFORM_FEE_BPS
  // default in env.ts).
  const platformFeeBps = 1500;
  const computeFee = (gross: number) =>
    Math.round((gross * platformFeeBps) / 10_000);

  const buyerIds = [
    jordan.id,
    ...classmateUsers.map((c) => c.user.id),
  ];
  const buyer = (i: number) => buyerIds[i % buyerIds.length];

  type OrderSeed = {
    key: string; // stable suffix → externalId
    teacherName: string;
    courseSlug: string;
    buyerIdx: number;
    grossCents: number;
    status: "PAID" | "REFUNDED" | "PENDING";
    /** Days before "now" the order was paid (only matters when status=PAID/REFUNDED). */
    paidDaysAgo?: number;
    /** Days before "now" the refund landed. */
    refundedDaysAgo?: number;
  };

  // Three marketplace teachers, three paid courses, mix of buyers + statuses.
  // Most orders fall inside the current calendar month so the MTD KPI on
  // /teacher/earnings has a meaningful number.
  const orderSeeds: OrderSeed[] = [
    // Mr. Adeyemi · Algebra Foundations ($19) — payouts-enabled, 4 orders
    { key: "adeyemi-1", teacherName: "Mr. Adeyemi", courseSlug: "algebra-foundations", buyerIdx: 0, grossCents: 49900, status: "PAID", paidDaysAgo: 1 },
    { key: "adeyemi-2", teacherName: "Mr. Adeyemi", courseSlug: "algebra-foundations", buyerIdx: 1, grossCents: 49900, status: "PAID", paidDaysAgo: 4 },
    { key: "adeyemi-3", teacherName: "Mr. Adeyemi", courseSlug: "algebra-foundations", buyerIdx: 2, grossCents: 49900, status: "PAID", paidDaysAgo: 9 },
    { key: "adeyemi-4", teacherName: "Mr. Adeyemi", courseSlug: "algebra-foundations", buyerIdx: 3, grossCents: 49900, status: "REFUNDED", paidDaysAgo: 18, refundedDaysAgo: 16 },

    // Studio Pi · Geometry Origami ($29) — no Stripe account yet, 3 orders
    { key: "studiopi-1", teacherName: "Studio Pi", courseSlug: "geometry-origami", buyerIdx: 4, grossCents: 99900, status: "PAID", paidDaysAgo: 2 },
    { key: "studiopi-2", teacherName: "Studio Pi", courseSlug: "geometry-origami", buyerIdx: 0, grossCents: 99900, status: "PAID", paidDaysAgo: 12 },
    { key: "studiopi-3", teacherName: "Studio Pi", courseSlug: "geometry-origami", buyerIdx: 2, grossCents: 99900, status: "PENDING" },

    // Lyceum School · Math Olympiad ($49) — account onboarded but payouts pending, 2 orders
    { key: "lyceum-1", teacherName: "Lyceum School", courseSlug: "math-olympiad-prep", buyerIdx: 1, grossCents: 149900, status: "PAID", paidDaysAgo: 5 },
    { key: "lyceum-2", teacherName: "Lyceum School", courseSlug: "math-olympiad-prep", buyerIdx: 3, grossCents: 149900, status: "PAID", paidDaysAgo: 22 },
  ];

  const nowMs = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  for (const o of orderSeeds) {
    const teacher = teachers.get(o.teacherName);
    if (!teacher) continue;
    const course = await db.course.findUnique({ where: { slug: o.courseSlug } });
    if (!course) continue;
    const userId = buyer(o.buyerIdx);
    const feeCents = computeFee(o.grossCents);
    const netCents = o.grossCents - feeCents;
    const paidAt =
      o.status === "PAID" || o.status === "REFUNDED"
        ? new Date(nowMs - (o.paidDaysAgo ?? 0) * dayMs)
        : null;
    const refundedAt =
      o.status === "REFUNDED"
        ? new Date(nowMs - (o.refundedDaysAgo ?? 0) * dayMs)
        : null;
    const externalId = `demo_seed_${o.key}`;
    await db.order.upsert({
      where: { externalId },
      update: {
        status: o.status,
        paidAt,
        refundedAt,
        grossCents: o.grossCents,
        feeCents,
        netCents,
      },
      create: {
        userId,
        courseId: course.id,
        teacherId: teacher.id,
        grossCents: o.grossCents,
        feeCents,
        netCents,
        currency: "usd",
        status: o.status,
        provider: "demo",
        externalId,
        paidAt,
        refundedAt,
      },
    });
    // PAID orders should produce an Enrollment so the buyer's library
    // reflects the purchase. REFUNDED orders we leave alone — refund
    // handler cancels the enrollment when it lands (see webhook).
    if (o.status === "PAID") {
      await db.enrollment.upsert({
        where: { userId_courseId: { userId, courseId: course.id } },
        update: {},
        create: {
          userId,
          courseId: course.id,
          lastActivityAt: paidAt ?? new Date(),
        },
      });
    }
  }

  // Stripe Connect account states — one fully onboarded, one partial,
  // one absent. Lets us screenshot every state of the EarningsClient
  // status card by signing in as different teachers.
  const stripeAccountSeeds: Array<{
    teacherName: string;
    externalId: string;
    payoutsEnabled: boolean;
    chargesEnabled: boolean;
  }> = [
    {
      teacherName: "Mr. Adeyemi",
      externalId: "demo_acct_adeyemi_ready",
      payoutsEnabled: true,
      chargesEnabled: true,
    },
    {
      teacherName: "Lyceum School",
      externalId: "demo_acct_lyceum_partial",
      payoutsEnabled: false,
      chargesEnabled: true,
    },
    // Studio Pi: intentionally no account → "Not connected" CTA state.
  ];
  for (const s of stripeAccountSeeds) {
    const teacher = teachers.get(s.teacherName);
    if (!teacher) continue;
    await db.stripeAccount.upsert({
      where: { teacherId: teacher.id },
      update: {
        externalId: s.externalId,
        payoutsEnabled: s.payoutsEnabled,
        chargesEnabled: s.chargesEnabled,
        provider: "demo",
      },
      create: {
        teacherId: teacher.id,
        externalId: s.externalId,
        provider: "demo",
        payoutsEnabled: s.payoutsEnabled,
        chargesEnabled: s.chargesEnabled,
      },
    });
  }

  const paidCount = orderSeeds.filter((o) => o.status === "PAID").length;
  const refundedCount = orderSeeds.filter((o) => o.status === "REFUNDED").length;
  const pendingCount = orderSeeds.filter((o) => o.status === "PENDING").length;

  console.log("✅ seed complete");
  console.log(
    `   ${COURSE_SEEDS.length} courses, ${pathSeeds.length} paths, 1 institution, 1 student, ${classmates.length} classmates`
  );
  console.log(
    `   ${orderSeeds.length} orders (${paidCount} paid, ${refundedCount} refunded, ${pendingCount} pending) across ${stripeAccountSeeds.length} Stripe accounts`
  );

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
