import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { router, teacherProcedure } from "../trpc";
import {
  COURSE_GENERATOR_SYSTEM_PROMPT,
  OutlineSchema,
  OutlineUnitSchema,
  SettingsSchema,
  buildCourseGenPrompt,
  buildDemoOutline,
  type Outline,
  type OutlineUnit,
} from "@/lib/ai/prompts/courseGenerator";
import {
  QUESTION_GENERATOR_SYSTEM_PROMPT,
  QuestionBatchSchema,
  buildDemoQuestions,
  buildQuestionGenPrompt,
  computeWeakSpots,
  type GeneratedQuestion,
} from "@/lib/ai/prompts/questionGenerator";
import { audit } from "@/lib/audit";
import { checkAIQuota } from "@/lib/rateLimit";
import {
  completeStructured,
  isLlmEnabled,
  type LlmMode,
} from "@/lib/ai/llm";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

export const generatorRouter = router({
  /** Generate a fresh outline from a brief + settings. */
  outline: teacherProcedure
    .input(
      z.object({
        brief: z.string().min(20).max(2000),
        settings: SettingsSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await checkAIQuota({ actorId: ctx.user.id });
      const settings = SettingsSchema.parse(input.settings ?? {});
      const t0 = Date.now();

      let outline: Outline;
      let mode: LlmMode;
      if (isLlmEnabled()) {
        // The outline now includes per-lesson title + summary + an
        // 80-180 word readingContent block. A 5-unit / 4-lesson course
        // needs ~6-7K output tokens, hence the 8192 ask.
        const result = await completeStructured({
          schema: OutlineSchema,
          system: COURSE_GENERATOR_SYSTEM_PROMPT,
          prompt: buildCourseGenPrompt({ brief: input.brief, settings }),
          maxTokens: 8192,
        });
        outline = result.data;
        mode = result.mode;
      } else {
        outline = buildDemoOutline({ brief: input.brief, settings });
        mode = "demo";
      }

      // Audit unconditionally now — the previous version only logged
      // the demo path, so we had no record of real Claude generations.
      await audit({
        actorId: ctx.user.id,
        kind: "ai.course_outline",
        payload: {
          briefChars: input.brief.length,
          unitCount: outline.units.length,
          mode,
          elapsedMs: Date.now() - t0,
        },
      });
      return { outline, elapsedMs: Date.now() - t0 };
    }),

  /** Regenerate just one unit in an existing outline. */
  regenerateUnit: teacherProcedure
    .input(
      z.object({
        brief: z.string().min(20).max(2000),
        settings: SettingsSchema.optional(),
        outline: OutlineSchema,
        unitIndex: z.number().int().min(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await checkAIQuota({ actorId: ctx.user.id });
      const settings = SettingsSchema.parse(input.settings ?? {});
      if (input.unitIndex < 0 || input.unitIndex >= input.outline.units.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid unitIndex",
        });
      }
      const t0 = Date.now();

      let unit: OutlineUnit;
      let mode: LlmMode;
      if (isLlmEnabled()) {
        const target = input.outline.units[input.unitIndex];
        const others = input.outline.units
          .map((u, i) =>
            i === input.unitIndex
              ? "[REGENERATE THIS]"
              : `${i + 1}. ${u.title} — ${u.subtitle} (${u.lessons.length} lessons)`
          )
          .join("\n");
        // Same reason as the outline call: a regenerated unit now
        // carries N full lesson readings (~600-1500 tokens each).
        const result = await completeStructured({
          schema: OutlineUnitSchema,
          system: COURSE_GENERATOR_SYSTEM_PROMPT,
          prompt: `Course brief:\n"""\n${input.brief.trim()}\n"""\n\nFull outline so far:\n${others}\n\nThe unit at position ${input.unitIndex + 1} currently is:\n- ${target.title} — ${target.subtitle}\n\nProduce a *different* unit for that slot that fits the surrounding units. Keep the same shortLabel ("${target.shortLabel}"). Generate the same number of lessons as before (${target.lessons.length}).`,
          maxTokens: 4096,
        });
        // Force the shortLabel back so positions stay stable — the
        // model occasionally helpfully renumbers when it shouldn't.
        unit = { ...result.data, shortLabel: target.shortLabel };
        mode = result.mode;
        await audit({
          actorId: ctx.user.id,
          kind: "ai.regenerate_unit",
          payload: {
            unitIndex: input.unitIndex,
            before: { title: target.title },
            after: { title: unit.title },
            mode,
            elapsedMs: Date.now() - t0,
          },
        });
        return { unit, elapsedMs: Date.now() - t0 };
      }

      // Demo fallback: shuffle the title/subtitle around so the unit
      // visibly changes. The lessons themselves stay the same — we
      // don't have a stub-content generator that's smart enough to
      // rewrite N readings while keeping the schema valid.
      const original = input.outline.units[input.unitIndex];
      const alternates: Record<string, OutlineUnit> = {
        "What is a variable?": {
          shortLabel: original.shortLabel,
          title: "Letters that hide numbers",
          subtitle: "Use boxes, blanks, and emojis to discover variables",
          lessons: original.lessons,
          durationLabel: original.durationLabel,
        },
        "Expressions & evaluating": {
          shortLabel: original.shortLabel,
          title: "Building math machines",
          subtitle: "Combine operations into reusable expressions",
          lessons: original.lessons,
          durationLabel: original.durationLabel,
        },
      };
      const fallback: OutlineUnit = alternates[original.title] ?? {
        shortLabel: original.shortLabel,
        title: original.title + " (revised)",
        subtitle: "Refined to better connect with the unit before it",
        lessons: original.lessons,
        durationLabel: original.durationLabel,
      };
      await audit({
        actorId: ctx.user.id,
        kind: "ai.regenerate_unit",
        payload: {
          unitIndex: input.unitIndex,
          before: { title: original.title },
          after: { title: fallback.title },
          mode: "demo" as LlmMode,
          elapsedMs: Date.now() - t0,
        },
      });
      return { unit: fallback, elapsedMs: Date.now() - t0 };
    }),

  /**
   * Generate N quiz questions for a lesson and persist them. Returns
   * the freshly-created Question rows so the inspector can render them.
   */
  generateQuestions: teacherProcedure
    .input(
      z.object({
        lessonId: z.string(),
        count: z.number().int().min(1).max(10).default(5),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await checkAIQuota({ actorId: ctx.user.id });
      const lesson = await ctx.db.lesson.findUnique({
        where: { id: input.lessonId },
        include: {
          questions: { select: { stem: true }, orderBy: { order: "asc" } },
          unit: {
            include: {
              course: {
                select: { authorId: true, title: true },
              },
            },
          },
        },
      });
      if (!lesson) throw new TRPCError({ code: "NOT_FOUND" });
      if (
        ctx.user.role !== "ADMIN" &&
        lesson.unit.course.authorId !== ctx.user.id
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const t0 = Date.now();
      const existingStems = lesson.questions.map((q) => q.stem);
      const maxOrder = lesson.questions.length;

      let generated: GeneratedQuestion[];
      let mode: LlmMode;
      if (isLlmEnabled()) {
        const result = await completeStructured({
          schema: QuestionBatchSchema,
          system: QUESTION_GENERATOR_SYSTEM_PROMPT,
          prompt: buildQuestionGenPrompt({
            lessonTitle: lesson.title,
            courseTitle: lesson.unit.course.title,
            existingStems,
            count: input.count,
          }),
          maxTokens: 3072,
        });
        // Sanity-check: enforce exactly one correct per question.
        generated = result.data.questions.filter(
          (q) => q.answers.filter((a) => a.correct).length === 1
        );
        if (generated.length === 0) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "AI didn't return any well-formed questions.",
          });
        }
        mode = result.mode;
      } else {
        generated = buildDemoQuestions({
          lessonTitle: lesson.title,
          count: input.count,
        });
        mode = "demo";
      }

      // Persist as Question rows.
      const created = await ctx.db.$transaction(
        generated.map((q, i) =>
          ctx.db.question.create({
            data: {
              lessonId: lesson.id,
              order: maxOrder + i + 1,
              stem: q.stem,
              difficulty: q.difficulty,
              answers: q.answers,
              hints: q.hint ? [q.hint] : [],
            },
            select: { id: true, stem: true, difficulty: true },
          })
        )
      );

      await audit({
        actorId: ctx.user.id,
        kind: "ai.generate_questions",
        payload: {
          requested: input.count,
          added: created.length,
          mode,
          elapsedMs: Date.now() - t0,
        },
        lessonId: lesson.id,
        courseId: lesson.unit.course.authorId
          ? undefined
          : undefined,
      });
      return {
        added: created.length,
        questions: created,
        elapsedMs: Date.now() - t0,
      };
    }),

  /**
   * Generate N questions for an AI_QUIZ block and persist them into
   * Block.settings.generated (an inline cache so every student sees
   * the same set without us paying tokens per visit). Ownership check
   * resolves the block → lesson → unit → course → authorId chain.
   * Teacher hits "Generate" again to refresh.
   */
  generateAiQuiz: teacherProcedure
    .input(
      z.object({
        blockId: z.string(),
        count: z.number().int().min(1).max(10).default(5),
        /** Optional teacher-supplied topic; falls back to the lesson title. */
        topic: z.string().trim().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await checkAIQuota({ actorId: ctx.user.id });
      const block = await ctx.db.block.findUnique({
        where: { id: input.blockId },
        select: {
          id: true,
          type: true,
          settings: true,
          lesson: {
            select: {
              id: true,
              title: true,
              unit: {
                select: {
                  course: { select: { authorId: true, title: true } },
                },
              },
            },
          },
        },
      });
      if (!block) throw new TRPCError({ code: "NOT_FOUND" });
      if (block.type !== "AI_QUIZ") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Block is not an AI_QUIZ",
        });
      }
      if (
        ctx.user.role !== "ADMIN" &&
        block.lesson.unit.course.authorId !== ctx.user.id
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const lessonTitle = (
        input.topic && input.topic.length > 0
          ? input.topic
          : block.lesson.title
      ).trim();
      const courseTitle = block.lesson.unit.course.title;
      const t0 = Date.now();

      // Adaptive-regenerate signal (Tier 4.3): when the block has a
      // previous batch with student attempts, pull per-question
      // pass-rate stats and feed weak items into the prompt so the
      // new batch targets the same concepts with different surface
      // forms. Skip the lookup when there's no prior batch (first
      // generate) — no attempts can exist yet.
      const previousSettings = (block.settings ?? {}) as Record<string, unknown>;
      const previousGenerated = previousSettings.generated as
        | { questions?: Array<{ stem?: unknown }> }
        | undefined;
      const previousQuestions: Array<{ stem: string }> = Array.isArray(
        previousGenerated?.questions
      )
        ? previousGenerated.questions.flatMap((q) =>
            q && typeof (q as { stem?: unknown }).stem === "string"
              ? [{ stem: (q as { stem: string }).stem }]
              : []
          )
        : [];

      let weakSpots: ReturnType<typeof computeWeakSpots> = [];
      if (previousQuestions.length > 0) {
        // Tier 1.2 chosenKey encoding for multi-question blocks is
        // "subIdx:choiceIdx" — only those rows belong to the prior
        // batch's questions.
        const attempts = await ctx.db.attempt.findMany({
          where: { blockId: block.id, chosenKey: { contains: ":" } },
          select: { chosenKey: true, correct: true },
        });
        weakSpots = computeWeakSpots(previousQuestions, attempts);
      }

      let generated: GeneratedQuestion[];
      let mode: LlmMode;
      if (isLlmEnabled()) {
        const result = await completeStructured({
          schema: QuestionBatchSchema,
          system: QUESTION_GENERATOR_SYSTEM_PROMPT,
          prompt: buildQuestionGenPrompt({
            lessonTitle,
            courseTitle,
            existingStems: previousQuestions.map((q) => q.stem),
            count: input.count,
            weakSpots,
          }),
          maxTokens: 3072,
        });
        generated = result.data.questions.filter(
          (q) => q.answers.filter((a) => a.correct).length === 1
        );
        if (generated.length === 0) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "AI didn't return any well-formed questions.",
          });
        }
        mode = result.mode;
      } else {
        generated = buildDemoQuestions({ lessonTitle, count: input.count });
        mode = "demo";
      }

      const nextSettings: Record<string, unknown> = {
        ...previousSettings,
        // Preserve teacher's intent for re-renders.
        topic: input.topic ?? previousSettings.topic ?? "",
        count: input.count,
        generated: {
          questions: generated,
          generatedAt: new Date().toISOString(),
          mode,
        },
      };
      await ctx.db.block.update({
        where: { id: block.id },
        data: { settings: nextSettings as Prisma.InputJsonValue },
      });

      await audit({
        actorId: ctx.user.id,
        kind: "ai.generate_questions",
        payload: {
          blockId: block.id,
          requested: input.count,
          added: generated.length,
          mode,
          elapsedMs: Date.now() - t0,
          scope: "ai_quiz_block",
          weakSpotsUsed: weakSpots.length,
          adaptive: weakSpots.length > 0,
        },
        lessonId: block.lesson.id,
      });

      return {
        questions: generated,
        generatedAt: new Date().toISOString(),
        elapsedMs: Date.now() - t0,
        weakSpotsUsed: weakSpots.length,
      };
    }),

  /** Persist an outline as a real Course + Units + (stub) Lessons. */
  saveAsCourse: teacherProcedure
    .input(
      z.object({
        outline: OutlineSchema,
        settings: SettingsSchema.optional(),
        brief: z.string().min(20).max(2000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const settings = SettingsSchema.parse(input.settings ?? {});
      const baseSlug = slugify(input.outline.title);

      // Ensure unique slug.
      let slug = baseSlug;
      let n = 1;
      while (
        await ctx.db.course.findUnique({
          where: { slug },
          select: { id: true },
        })
      ) {
        n += 1;
        slug = `${baseSlug}-${n}`;
      }

      const created = await ctx.db.course.create({
        data: {
          slug,
          title: input.outline.title,
          tagline: input.outline.tagline,
          description: input.outline.description,
          authorId: ctx.user.id,
          authorLabel: ctx.session.user.name ?? "Teacher",
          subject: settings.subject.toLowerCase().split(/\s|·/)[0] || "math",
          grade: settings.grade.replace(/[^0-9]/g, "") || "6",
          status: "DRAFT",
          priceCents: 0,
          ratingAvg: 0,
          ratingCount: 0,
          enrollCount: 0,
          aiHint: `Generated from prompt: "${input.brief.slice(0, 80).trim()}…"`,
          upgradeNote: null,
          learnOutcomes: [],
          units: {
            create: input.outline.units.map((u, i) => ({
              order: i + 1,
              title: u.title,
              subtitle: u.subtitle,
              estLabel: `${u.lessons.length} lessons · ${u.durationLabel}`,
              // Real per-lesson titles + intros now, plus a starter
               // READING block seeded with the AI-generated content so
               // students see actual prose on day one. The prototype
               // version saved a stub shell labeled "Lesson 1" with
               // intro=null and zero blocks, which made every freshly
               // saved AI course look empty to students.
              lessons: {
                create: u.lessons.map((lesson, j) => ({
                  order: j + 1,
                  title: lesson.title,
                  slug: `${slug}-u${i + 1}-l${j + 1}`,
                  durationMin: 8,
                  isPreview: i === 0 && j === 0,
                  intro: lesson.summary,
                  blocks: {
                    create: [
                      {
                        type: "READING",
                        order: 1,
                        settings: {
                          label: "Read this first",
                          body: lesson.readingContent,
                        } as Prisma.InputJsonValue,
                      },
                    ],
                  },
                })),
              },
            })),
          },
        },
        select: { id: true, slug: true },
      });

      return {
        ok: true as const,
        courseId: created.id,
        slug: created.slug,
      };
    }),
});

// Helpers used to live here for parsing Anthropic-shaped structured
// outputs. They're now obsolete — `lib/ai/llm.ts#completeStructured`
// handles the parse + validate for both providers in one place.

