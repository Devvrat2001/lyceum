import { z } from "zod";

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
  lessonCount: z
    .number()
    .int()
    .min(3)
    .max(12)
    .describe("How many lessons in this unit."),
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
Your job: turn a teacher's brief into a strong course outline.

Style guide for outputs:

1. Pedagogically sound. Each unit builds on the previous one. Don't
   dump everything in unit 1.
2. Concrete. Unit subtitles describe what students *do*, not what they
   "learn about" — favor active verbs.
3. K-12 appropriate. No mature themes. Real-world examples that a
   middle-schooler would recognize.
4. The capstone unit should be a project, not more practice. Make it
   memorable.
5. Lengths add up. The course's lessonCount sum should land within
   ~20% of the teacher's requested length.
6. Use the Lyceum house style:
   - First unit title is usually a question ("What is X?", "Why do we...")
   - Subtitles end without periods
   - durationLabel format: "1.5 hr", "~2 hr", "45 min"
7. Honor the teacher's grade level, subject, standard, tone, and
   difficulty curve in the language you pick.`;

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
 * real one — keeps the demo flow working even without a key.
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
          lessonCount: 4,
          durationLabel: "1 hr",
        },
        {
          shortLabel: "Unit 2",
          title: "Book one: setting + character",
          subtitle: "Discuss with the AI, then write a character map",
          lessonCount: 6,
          durationLabel: "2 hr",
        },
        {
          shortLabel: "Unit 3",
          title: "Book two: theme",
          subtitle: "Spot the theme by gathering evidence across chapters",
          lessonCount: 6,
          durationLabel: "2 hr",
        },
        {
          shortLabel: "Unit 4",
          title: "Capstone · publish a review",
          subtitle: "Draft, edit, and post a one-page review for the class",
          lessonCount: 4,
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
        lessonCount: 4,
        durationLabel: "1.5 hr",
      },
      {
        shortLabel: "Unit 2",
        title: "Expressions & evaluating",
        subtitle: "Combining numbers and letters",
        lessonCount: 6,
        durationLabel: "2 hr",
      },
      {
        shortLabel: "Unit 3",
        title: "One-step equations",
        subtitle: "Solving x + 4 = 10 visually",
        lessonCount: 5,
        durationLabel: "1.5 hr",
      },
      {
        shortLabel: "Unit 4",
        title: "Two-step equations",
        subtitle: "Order of operations matters",
        lessonCount: 5,
        durationLabel: "2 hr",
      },
      {
        shortLabel: "Unit 5",
        title: "Capstone · grocery budget project",
        subtitle: "Real numbers, real impact",
        lessonCount: 4,
        durationLabel: "1.5 hr",
      },
    ],
  };
}
