import { z } from "zod";

export const OutlineLessonSchema = z.object({
  title: z
    .string()
    .min(3)
    .max(80)
    .describe("3-7 word lesson title. No 'Lesson N' prefix."),
  summary: z
    .string()
    .min(10)
    .max(280)
    .describe(
      "One sentence on what students do in this lesson. Concrete verb, no fluff."
    ),
  readingContent: z
    .string()
    .min(120)
    .max(1200)
    .describe(
      "80-180 word reading passage that teaches the lesson concept. Plain prose (no markdown, no headings), friendly + grade-appropriate, uses 1-2 concrete examples a kid in that grade would recognize."
    ),
});

export const OutlineUnitSchema = z.object({
  shortLabel: z
    .string()
    .describe("Display label like 'Unit 1'. Lyceum convention is 'Unit N'."),
  title: z.string().describe("3-7 word unit title."),
  subtitle: z
    .string()
    .describe(
      "One sentence on what students do in this unit. Concrete, not vague."
    ),
  lessons: z
    .array(OutlineLessonSchema)
    .min(3)
    .max(10)
    .describe(
      "Sequential lessons in this unit. Order matters — first lesson is the warm-up, last is the consolidation."
    ),
  durationLabel: z
    .string()
    .describe("Estimated total time, like '1.5 hr' or '~2 hr'."),
});

export const OutlineSchema = z.object({
  title: z
    .string()
    .describe(
      "Full course title (e.g., 'Algebra Foundations · Grade 6'). Include the grade."
    ),
  tagline: z
    .string()
    .describe(
      "One sentence elevator pitch for the storefront card. Friendly, not corporate."
    ),
  description: z
    .string()
    .describe(
      "2-3 sentence course description for the course detail page. Mentions the learning arc."
    ),
  units: z
    .array(OutlineUnitSchema)
    .min(3)
    .max(8)
    .describe("Sequential units. Order matters — first unit is foundational."),
});

export type Outline = z.infer<typeof OutlineSchema>;
export type OutlineUnit = z.infer<typeof OutlineUnitSchema>;
export type OutlineLesson = z.infer<typeof OutlineLessonSchema>;

// ─── Chunked-generation variants ───
// The full OutlineSchema is too expensive to generate in a single call
// (4-6 units × 3-10 lessons × 80-180 word readings ≈ 6-8K output tokens,
// which takes Sonnet 4.5 ~50-70s — past Hobby's 60s function ceiling).
// The job worker chunks it into:
//   chunk 0:  OutlineSkeletonSchema    (~2K tokens, ~10-15s)
//   chunk i:  UnitReadingsSchema       (~1.5K tokens per unit, ~15-25s)
// then merges them into a full Outline before saving.

export const OutlineSkeletonLessonSchema = z.object({
  title: z
    .string()
    .describe("3-7 word lesson title. No 'Lesson N' prefix."),
  summary: z
    .string()
    .describe(
      "One sentence on what students do in this lesson. Concrete verb, no fluff."
    ),
});

export const OutlineSkeletonUnitSchema = z.object({
  shortLabel: z.string().describe("Display label like 'Unit 1'."),
  title: z.string().describe("3-7 word unit title."),
  subtitle: z
    .string()
    .describe("One sentence on what students do in this unit."),
  lessons: z
    .array(OutlineSkeletonLessonSchema)
    .describe("Sequential lessons in this unit. Order matters."),
  durationLabel: z.string().describe("Estimated total time, like '1.5 hr'."),
});

export const OutlineSkeletonSchema = z.object({
  title: z.string().describe("Full course title with grade."),
  tagline: z.string().describe("One sentence elevator pitch."),
  description: z.string().describe("2-3 sentence course description."),
  units: z
    .array(OutlineSkeletonUnitSchema)
    .describe("Sequential units. Order matters."),
});

export type OutlineSkeleton = z.infer<typeof OutlineSkeletonSchema>;
export type OutlineSkeletonUnit = z.infer<typeof OutlineSkeletonUnitSchema>;

/**
 * Per-unit readings batch. The worker calls this once per unit with the
 * unit's lesson titles + summaries already in the prompt, and asks for
 * one reading per lesson in the same order.
 */
export const UnitReadingsSchema = z.object({
  readings: z
    .array(z.string())
    .describe(
      "One 80-180 word reading passage per lesson, in lesson order. Plain prose, no markdown, no headings. Use grade-appropriate hooks + a worked example. Don't refer to 'this lesson'."
    ),
});

export type UnitReadings = z.infer<typeof UnitReadingsSchema>;

export const SettingsSchema = z.object({
  grade: z.string().default("Grade 6"),
  subject: z.string().default("Math"),
  standard: z.string().default("CCSS 6.EE.A,B,C"),
  lengthLabel: z.string().default("~8 hours · 24 lessons"),
  style: z.string().default("Visual / interactive"),
  tone: z.string().default("Friendly, encouraging"),
  difficulty: z.string().default("Gentle ramp"),
});

export type GeneratorSettings = z.infer<typeof SettingsSchema>;

export const COURSE_GENERATOR_SYSTEM_PROMPT = `You are the Lyceum AI course architect.
Your job: turn a teacher's brief into a strong course outline INCLUDING
the lessons in each unit and a short reading passage per lesson.

Style guide for outputs:

1. Pedagogically sound. Each unit builds on the previous one, and
   within a unit each lesson builds on the previous one. Don't dump
   everything in unit 1, and don't dump everything in the first lesson
   of a unit.
2. Concrete. Unit subtitles AND lesson summaries describe what
   students *do*, not what they "learn about" — favor active verbs.
3. K-12 appropriate. No mature themes. Real-world examples that a
   middle-schooler would recognize.
4. The capstone unit should be a project, not more practice. Make its
   lessons culminate in a deliverable.
5. The total lesson count (sum across all units) should land within
   ~20% of the teacher's requested length.
6. Use the Lyceum house style:
   - First unit title is usually a question ("What is X?", "Why do we...")
   - Subtitles end without periods
   - durationLabel format: "1.5 hr", "~2 hr", "45 min"
   - Lesson titles have NO "Lesson N" prefix — just the concept name
7. Per-lesson readingContent is the most important field. Treat it as
   the actual teaching text the student will read:
   - 80-180 words, plain prose, NO markdown / headings / bullet lists
   - Open with a hook the student cares about; close with the takeaway
   - Use a real grade-appropriate worked example wherever possible
   - Don't refer to "this lesson" or "in this video" — just teach
   - Tone matches the teacher's settings (friendly, encouraging, etc.)
8. Honor the teacher's grade level, subject, standard, tone, and
   difficulty curve in the language you pick.`;

/**
 * Chunk-0 prompt: ask for outline structure WITHOUT readingContent.
 * Fast (~10-15s for Sonnet 4.5) and gives the client something to
 * render immediately. The follow-up chunks fill in readings unit-by-unit.
 */
export function buildOutlineSkeletonPrompt(args: {
  brief: string;
  settings: GeneratorSettings;
}): string {
  const { brief, settings } = args;
  return `Course brief from the teacher:

"""
${brief.trim()}
"""

Settings to respect:
- Grade level: ${settings.grade}
- Subject: ${settings.subject}
- Standard: ${settings.standard}
- Length: ${settings.lengthLabel}
- Style: ${settings.style}
- Tone: ${settings.tone}
- Difficulty curve: ${settings.difficulty}

Produce a course outline STRUCTURE ONLY: title, tagline, description, and
4-6 units. Each unit has shortLabel ("Unit 1", "Unit 2", …), title, subtitle,
durationLabel, and 3-10 lessons. Each lesson has title + summary ONLY
(no reading content — that comes next, separately). Last unit should be a
project/capstone.`;
}

/**
 * Chunk-i prompt: given a unit's title/subtitle and its lesson list
 * (title + summary), ask for one 80-180 word reading per lesson in
 * order. Smaller schema = faster generation per call (~15-25s).
 */
export function buildUnitReadingsPrompt(args: {
  brief: string;
  settings: GeneratorSettings;
  courseTitle: string;
  unit: OutlineSkeletonUnit;
}): string {
  const { brief, settings, courseTitle, unit } = args;
  const lessonList = unit.lessons
    .map(
      (l, i) =>
        `  ${i + 1}. "${l.title}" — ${l.summary}`
    )
    .join("\n");
  return `You are writing per-lesson reading content for an existing course.

Course brief from the teacher:
"""
${brief.trim()}
"""

Course title: "${courseTitle}"
Settings: ${settings.grade} · ${settings.subject} · ${settings.tone}

Current unit: "${unit.title}" — ${unit.subtitle}

Lessons in this unit (in order):
${lessonList}

Write ONE reading passage per lesson, IN THE SAME ORDER as the list above.

For each reading:
- 80-180 words, plain prose, NO markdown / headings / bullet lists
- Open with a hook the student cares about; close with the takeaway
- Use a real grade-appropriate worked example wherever possible
- Don't refer to "this lesson" or "in this video" — just teach
- Match the teacher's tone (${settings.tone})

Return an object with a single field "readings" — an array of ${unit.lessons.length}
strings in lesson order.`;
}

export function buildCourseGenPrompt(args: {
  brief: string;
  settings: GeneratorSettings;
}): string {
  const { brief, settings } = args;
  return `Course brief from the teacher:

"""
${brief.trim()}
"""

Settings to respect:
- Grade level: ${settings.grade}
- Subject: ${settings.subject}
- Standard: ${settings.standard}
- Length: ${settings.lengthLabel}
- Style: ${settings.style}
- Tone: ${settings.tone}
- Difficulty curve: ${settings.difficulty}

Produce a structured course outline that matches the schema you've been
given. Aim for 4–6 units. Make the last unit a project/capstone.`;
}

/**
 * Stub outline used when no ANTHROPIC_API_KEY is set. Same shape as the
 * real one — keeps the demo flow working without a key, but every
 * readingContent is an obvious placeholder so teachers + students can
 * tell at a glance that the AI builder is running in demo mode.
 */
export function buildDemoOutline(args: {
  brief: string;
  settings: GeneratorSettings;
}): Outline {
  const briefLower = args.brief.toLowerCase();
  const isAlgebra =
    briefLower.includes("algebra") || briefLower.includes("variable");
  const isReading =
    briefLower.includes("reading") || briefLower.includes("book");

  // Single helper so each demo readingContent is uniformly honest about
  // being a placeholder (and long enough to satisfy the schema's
  // min(120) char floor without writing real per-lesson prose).
  const stub = (lessonTitle: string, unitTitle: string): OutlineLesson => ({
    title: lessonTitle,
    summary: `Students explore "${lessonTitle.toLowerCase()}" inside the "${unitTitle}" unit.`,
    readingContent: `Placeholder reading for "${lessonTitle}" in the "${unitTitle}" unit. The AI course builder is running in demo mode because the ANTHROPIC_API_KEY env var isn't set on this deployment. Set the key in Vercel → Project Settings → Environment Variables, redeploy, and re-run the generator — Claude will replace this stub with a real grade-appropriate reading tailored to your brief.`,
  });

  if (isReading) {
    return {
      title: `Reading Lab · ${args.settings.grade}`,
      tagline:
        "Build the joy of close reading with discussion-led chapter books.",
      description:
        "Read three modern novels with AI-led discussion partners. Students practice citing evidence, predicting outcomes, and writing their own short responses. Capstone: a one-page review students publish to their class library.",
      units: [
        {
          shortLabel: "Unit 1",
          title: "How readers think",
          subtitle: "Predict, question, summarize — three habits to start",
          lessons: [
            stub("Predicting from the cover", "How readers think"),
            stub("Asking better questions", "How readers think"),
            stub("Summarizing in one breath", "How readers think"),
          ],
          durationLabel: "1 hr",
        },
        {
          shortLabel: "Unit 2",
          title: "Book one: setting + character",
          subtitle: "Discuss with the AI, then write a character map",
          lessons: [
            stub("Reading the opening chapter", "Book one: setting + character"),
            stub("Mapping where things happen", "Book one: setting + character"),
            stub("Who is the protagonist?", "Book one: setting + character"),
          ],
          durationLabel: "2 hr",
        },
        {
          shortLabel: "Unit 3",
          title: "Book two: theme",
          subtitle: "Spot the theme by gathering evidence across chapters",
          lessons: [
            stub("What is a theme?", "Book two: theme"),
            stub("Collecting textual evidence", "Book two: theme"),
            stub("Comparing two themes", "Book two: theme"),
          ],
          durationLabel: "2 hr",
        },
        {
          shortLabel: "Unit 4",
          title: "Capstone · publish a review",
          subtitle: "Draft, edit, and post a one-page review for the class",
          lessons: [
            stub("Drafting your opinion", "Capstone"),
            stub("Editing for clarity", "Capstone"),
            stub("Publishing to the class library", "Capstone"),
          ],
          durationLabel: "1.5 hr",
        },
      ],
    };
  }

  // Default: algebra-foundations-style outline
  return {
    title: `${
      isAlgebra ? "Algebra Foundations" : "Course"
    } · ${args.settings.grade}`,
    tagline:
      "A friendly, visual journey from variables to expressions to real-world problems.",
    description:
      "Build comfort with letters-for-numbers, then expressions, then one- and two-step equations. The capstone has students model their family's grocery budget with variables.",
    units: [
      {
        shortLabel: "Unit 1",
        title: "What is a variable?",
        subtitle: "Why letters? Real-world stand-ins",
        lessons: [
          stub("Letters that hide numbers", "What is a variable?"),
          stub("From boxes to symbols", "What is a variable?"),
          stub("Substituting back in", "What is a variable?"),
        ],
        durationLabel: "1.5 hr",
      },
      {
        shortLabel: "Unit 2",
        title: "Expressions & evaluating",
        subtitle: "Combining numbers and letters",
        lessons: [
          stub("Writing a first expression", "Expressions & evaluating"),
          stub("Order of operations", "Expressions & evaluating"),
          stub("Evaluating with a value", "Expressions & evaluating"),
        ],
        durationLabel: "2 hr",
      },
      {
        shortLabel: "Unit 3",
        title: "One-step equations",
        subtitle: "Solving x + 4 = 10 visually",
        lessons: [
          stub("Balance scales as equations", "One-step equations"),
          stub("Adding the same to both sides", "One-step equations"),
          stub("Checking your answer", "One-step equations"),
        ],
        durationLabel: "1.5 hr",
      },
      {
        shortLabel: "Unit 4",
        title: "Two-step equations",
        subtitle: "Order of operations matters",
        lessons: [
          stub("When two moves are needed", "Two-step equations"),
          stub("Choosing which move first", "Two-step equations"),
          stub("Word problems with two steps", "Two-step equations"),
        ],
        durationLabel: "2 hr",
      },
      {
        shortLabel: "Unit 5",
        title: "Capstone · grocery budget project",
        subtitle: "Real numbers, real impact",
        lessons: [
          stub("Estimating a week of groceries", "Capstone"),
          stub("Modeling unknowns with variables", "Capstone"),
          stub("Presenting your budget", "Capstone"),
        ],
        durationLabel: "1.5 hr",
      },
    ],
  };
}
