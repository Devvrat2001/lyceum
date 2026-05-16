import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, teacherProcedure } from "../trpc";
import {
  CLAUDE_MODEL,
  getClaude,
  isClaudeEnabled,
} from "@/lib/ai/claude";
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
  type GeneratedQuestion,
} from "@/lib/ai/prompts/questionGenerator";
import { audit } from "@/lib/audit";
import { checkAIQuota } from "@/lib/rateLimit";

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

      if (isClaudeEnabled()) {
        const client = getClaude()!;
        // Anthropic's structured-output JSON Schema doesn't accept Zod
        // descriptions on `.describe()` chains in every field — convert
        // to a plain JSON Schema instead.
        const schema = zodToJsonSchema(OutlineSchema);
        const res = await client.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: 4096,
          system: COURSE_GENERATOR_SYSTEM_PROMPT,
          messages: [
            { role: "user", content: buildCourseGenPrompt({ brief: input.brief, settings }) },
          ],
          output_config: {
            format: { type: "json_schema", schema },
          },
        });
        const outline = extractOutlineFromResponse(res);
        return { outline, elapsedMs: Date.now() - t0 };
      }

      // Demo fallback.
      const outline = buildDemoOutline({ brief: input.brief, settings });
      await audit({
        actorId: ctx.user.id,
        kind: "ai.course_outline",
        payload: {
          briefChars: input.brief.length,
          unitCount: outline.units.length,
          mode: isClaudeEnabled() ? "claude" : "demo",
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

      if (isClaudeEnabled()) {
        const client = getClaude()!;
        const target = input.outline.units[input.unitIndex];
        const others = input.outline.units
          .map((u, i) => (i === input.unitIndex ? "[REGENERATE THIS]" : `${i + 1}. ${u.title} — ${u.subtitle} (${u.lessonCount} lessons)`))
          .join("\n");
        const schema = zodToJsonSchema(OutlineUnitSchema);
        const res = await client.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: 1024,
          system: COURSE_GENERATOR_SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: `Course brief:\n"""\n${input.brief.trim()}\n"""\n\nFull outline so far:\n${others}\n\nThe unit at position ${input.unitIndex + 1} currently is:\n- ${target.title} — ${target.subtitle}\n\nProduce a *different* unit for that slot that fits the surrounding units. Keep the same shortLabel ("${target.shortLabel}").`,
            },
          ],
          output_config: {
            format: { type: "json_schema", schema },
          },
        });
        const unit = extractUnitFromResponse(res, target.shortLabel);
        return { unit, elapsedMs: Date.now() - t0 };
      }

      // Demo fallback: shuffle the title/subtitle around so the unit visibly changes.
      const original = input.outline.units[input.unitIndex];
      const alternates: Record<string, OutlineUnit> = {
        "What is a variable?": {
          shortLabel: original.shortLabel,
          title: "Letters that hide numbers",
          subtitle: "Use boxes, blanks, and emojis to discover variables",
          lessonCount: original.lessonCount,
          durationLabel: original.durationLabel,
        },
        "Expressions & evaluating": {
          shortLabel: original.shortLabel,
          title: "Building math machines",
          subtitle: "Combine operations into reusable expressions",
          lessonCount: original.lessonCount,
          durationLabel: original.durationLabel,
        },
      };
      const fallback: OutlineUnit = alternates[original.title] ?? {
        shortLabel: original.shortLabel,
        title: original.title + " (revised)",
        subtitle: "Refined to better connect with the unit before it",
        lessonCount: original.lessonCount,
        durationLabel: original.durationLabel,
      };
      await audit({
        actorId: ctx.user.id,
        kind: "ai.regenerate_unit",
        payload: {
          unitIndex: input.unitIndex,
          before: { title: original.title },
          after: { title: fallback.title },
          mode: isClaudeEnabled() ? "claude" : "demo",
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
      if (isClaudeEnabled()) {
        const client = getClaude()!;
        const schema = zodToJsonSchema(QuestionBatchSchema);
        const res = await client.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: 3072,
          system: QUESTION_GENERATOR_SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: buildQuestionGenPrompt({
                lessonTitle: lesson.title,
                courseTitle: lesson.unit.course.title,
                existingStems,
                count: input.count,
              }),
            },
          ],
          output_config: { format: { type: "json_schema", schema } },
        });
        const text = res.content
          .map((b) => (b.type === "text" ? b.text ?? "" : ""))
          .join("")
          .trim()
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```$/i, "");
        const parsed = QuestionBatchSchema.safeParse(JSON.parse(text));
        if (!parsed.success) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `AI returned invalid questions: ${parsed.error.message}`,
          });
        }
        // Sanity-check: enforce exactly one correct per question.
        generated = parsed.data.questions.filter(
          (q) => q.answers.filter((a) => a.correct).length === 1
        );
        if (generated.length === 0) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "AI didn't return any well-formed questions.",
          });
        }
      } else {
        generated = buildDemoQuestions({
          lessonTitle: lesson.title,
          count: input.count,
        });
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
          mode: isClaudeEnabled() ? "claude" : "demo",
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
              estLabel: `${u.lessonCount} lessons · ${u.durationLabel}`,
              lessons: {
                create: Array.from({ length: u.lessonCount }).map((_, j) => ({
                  order: j + 1,
                  title: `Lesson ${j + 1}`,
                  slug: `${slug}-u${i + 1}-l${j + 1}`,
                  durationMin: 8,
                  isPreview: i === 0 && j === 0,
                  intro: null,
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

// ─────────────────────────────────────────────────────────────────────
// Helpers

type ContentBlock = { type?: string; text?: string; input?: unknown };

function extractOutlineFromResponse(res: { content: ContentBlock[] }): Outline {
  // Anthropic returns structured outputs as a single text block whose
  // .text is parseable JSON. Sometimes wrapped in code fences — strip
  // them defensively.
  const text = res.content
    .map((b) => (b.type === "text" ? b.text ?? "" : ""))
    .join("");
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  const parsed = OutlineSchema.safeParse(JSON.parse(stripped));
  if (!parsed.success) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `AI returned invalid outline: ${parsed.error.message}`,
    });
  }
  return parsed.data;
}

function extractUnitFromResponse(
  res: { content: ContentBlock[] },
  enforceLabel: string
): OutlineUnit {
  const text = res.content
    .map((b) => (b.type === "text" ? b.text ?? "" : ""))
    .join("");
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  const obj = JSON.parse(stripped) as Record<string, unknown>;
  // Force the shortLabel back to what the caller wanted so positions stay stable.
  obj.shortLabel = enforceLabel;
  const parsed = OutlineUnitSchema.safeParse(obj);
  if (!parsed.success) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `AI returned invalid unit: ${parsed.error.message}`,
    });
  }
  return parsed.data;
}

/**
 * Hand-rolled Zod → JSON Schema converter that produces the subset
 * Anthropic structured outputs accepts (no minLength/maxLength etc).
 * Kept small to avoid pulling in a heavy dep just for this.
 */
function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value);
      if (!(value instanceof z.ZodOptional)) {
        required.push(key);
      }
    }
    return {
      type: "object",
      properties,
      required,
      additionalProperties: false,
    };
  }
  if (schema instanceof z.ZodArray) {
    return {
      type: "array",
      items: zodToJsonSchema(schema.element as z.ZodTypeAny),
    };
  }
  if (schema instanceof z.ZodString) {
    const out: Record<string, unknown> = { type: "string" };
    if (schema.description) out.description = schema.description;
    return out;
  }
  if (schema instanceof z.ZodNumber) {
    const out: Record<string, unknown> = { type: "number" };
    if (schema.description) out.description = schema.description;
    return out;
  }
  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema.unwrap() as z.ZodTypeAny);
  }
  if (schema instanceof z.ZodDefault) {
    return zodToJsonSchema(schema.removeDefault() as z.ZodTypeAny);
  }
  return { type: "string" };
}
