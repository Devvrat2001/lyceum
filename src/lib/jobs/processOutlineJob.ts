import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db as prisma } from "@/lib/db";
import {
  OutlineSkeletonSchema,
  RichLessonBlockSchema,
  UnitLessonsSchema,
  UnitLessonsStrictSchema,
  COURSE_GENERATOR_SYSTEM_PROMPT,
  SettingsSchema,
  buildOutlineSkeletonPrompt,
  buildUnitLessonsPrompt,
  type Outline,
  type OutlineSkeleton,
  type OutlineLesson,
  type GeneratorSettings,
  type RichLessonBlock,
} from "@/lib/ai/prompts/courseGenerator";
import { completeStructured, isLlmEnabled } from "@/lib/ai/llm";
import { enqueueOutlineChunk, isQStashEnabled } from "@/lib/qstash";

/**
 * Shape of the GenerationJob.input row for outline jobs. Stored as
 * Json in Postgres; this is the runtime contract callers must satisfy.
 */
export interface OutlineJobInput {
  brief: string;
  settings: GeneratorSettings;
}

/**
 * Lenient structural validation for the persisted `partial` Outline blob
 * read at the start of each chunk run.
 *
 * We deliberately do NOT reuse `OutlineSchema` here: the partial
 * intentionally holds sub-minimum placeholder readings (~110 chars,
 * below OutlineSchema's `readingContent.min(120)`) between chunks, and
 * the skeleton's unit/lesson counts aren't bound by OutlineSchema's
 * `min(3)` authoring rules — so the strict schema would reject a
 * perfectly valid in-flight blob and fail every generation. We only need
 * to confirm the shape the chunk logic reads (`units[].lessons[]`) is
 * intact, so a drifted or half-written blob fails the job cleanly here
 * instead of crashing deep at `partial.units[unitIdx]`.
 */
const PartialOutlineShape = z.object({
  title: z.string(),
  tagline: z.string(),
  description: z.string(),
  units: z
    .array(
      z.object({
        shortLabel: z.string(),
        title: z.string(),
        subtitle: z.string(),
        durationLabel: z.string(),
        lessons: z.array(
          z.object({
            title: z.string(),
            summary: z.string(),
            readingContent: z.string(),
          })
        ),
      })
    )
    .min(1),
});

/**
 * Returns the partial Outline when `blob` is structurally intact, else
 * null. Returns the ORIGINAL object (cast) on success — not the parsed
 * copy — so accumulated fields like `lessons[].blocks` survive untouched.
 */
export function validatePartialOutline(blob: unknown): Outline | null {
  return PartialOutlineShape.safeParse(blob).success
    ? (blob as Outline)
    : null;
}

/**
 * Placeholder reading stored for each lesson after the skeleton chunk,
 * before its real reading is generated. MUST be ≥120 chars so a course
 * whose generation fails midway is still saveable via `saveAsCourse`
 * (which validates `OutlineSchema`, where `readingContent.min(120)`).
 * Guarded by a test. (Was 110 chars — the bug logged as KNOWN_ISSUES
 * S3-5; padded 2026-06-06.)
 */
export const SKELETON_READING_PLACEHOLDER =
  "(Reading not yet generated — the next chunk will replace this placeholder with a real 80-to-180 word reading passage written for this lesson.)";

/**
 * Process exactly ONE chunk of an outline job, then save progress and
 * either enqueue the next chunk (QStash path) or return so the caller
 * can loop (inline path).
 *
 * Chunks:
 *   0           — generate OutlineSkeleton (units + lesson titles only)
 *   1..N        — generate readings for unit (chunkIdx - 1)
 *   N+1 == done — total chunks = units.length + 1
 *
 * Returns { done: true } when the job is fully complete (status set
 * to "succeeded" + output written). Returns { done: false } otherwise.
 *
 * On failure, marks the job status="failed" with the error message and
 * still returns { done: true } so the caller stops looping.
 */
export async function processOutlineChunk(
  jobId: string
): Promise<{ done: boolean }> {
  const job = await prisma.generationJob.findUnique({ where: { id: jobId } });
  if (!job) {
    // Job vanished — nothing to do. Treat as done so worker stops.
    return { done: true };
  }
  if (job.status === "succeeded" || job.status === "failed" || job.status === "canceled") {
    return { done: true };
  }

  // Validate input shape on every chunk run — defensive, since input
  // is Json and could theoretically be tampered with from a different
  // code path in the future.
  const input = job.input as unknown as OutlineJobInput;
  if (!input?.brief || typeof input.brief !== "string") {
    await markFailed(jobId, "Invalid job input: missing brief");
    return { done: true };
  }
  const settings = SettingsSchema.parse(input.settings ?? {});

  try {
    if (job.nextChunk === 0) {
      // Chunk 0: generate skeleton.
      await prisma.generationJob.update({
        where: { id: jobId },
        data: { status: "running", step: "Generating outline structure" },
      });

      if (!isLlmEnabled()) {
        // No provider configured — fall through to demo skeleton so
        // the rest of the flow still works for screenshots / local dev.
        // We still go through the chunking machinery so the UX is the
        // same as the live path.
        const demo = buildDemoSkeleton(input.brief, settings);
        return await advanceAfterSkeleton(jobId, demo, "demo");
      }

      const { data: skeleton, mode } = await completeStructured({
        schema: OutlineSkeletonSchema,
        system: COURSE_GENERATOR_SYSTEM_PROMPT,
        prompt: buildOutlineSkeletonPrompt({
          brief: input.brief,
          settings,
        }),
        maxTokens: 4096,
      });
      return await advanceAfterSkeleton(jobId, skeleton, mode);
    }

    // Chunk i (>= 1): generate readings for unit (i - 1) and merge.
    const partial = validatePartialOutline(job.partial);
    if (!partial) {
      await markFailed(
        jobId,
        "Partial outline is missing or malformed — please regenerate the course."
      );
      return { done: true };
    }
    const unitIdx = job.nextChunk - 1;
    const unit = partial.units[unitIdx];
    if (!unit) {
      await markFailed(jobId, `Unit ${unitIdx} not found in skeleton`);
      return { done: true };
    }

    await prisma.generationJob.update({
      where: { id: jobId },
      data: {
        status: "running",
        step: `Building rich content for ${unit.shortLabel}: ${unit.title}`,
      },
    });

    if (!isLlmEnabled()) {
      // Demo mode: stub a minimal block stack so the rest of the
      // pipeline (validation, save) exercises the same code paths
      // it'd use in prod.
      const stubbedLessons = unit.lessons.map((l) =>
        stubBlockStack(l.title)
      );
      return await advanceAfterRichLessons(
        jobId,
        partial,
        unitIdx,
        stubbedLessons
      );
    }

    // Rich path: ~5-8K output tokens (4-7 blocks × 3-10 lessons), so
    // bump max_tokens to 8192. Still fits in 60s for typical unit
    // sizes; pathological 10-lesson units may need a per-lesson split
    // later, but we'll cross that bridge when we see it failing.
    //
    // Two-schema mode:
    //   - schema = UnitLessonsStrictSchema → drives the JSON Schema
    //     OpenAI sees as `response_format`, so it knows our exact
    //     field names (body, stem, options, pairs, …) and which
    //     discriminator strings are valid.
    //   - validateSchema = UnitLessonsSchema → loose Zod parse on
    //     the response, blocks: z.array(z.unknown()). We then run
    //     per-block validation below so one wonky block doesn't
    //     kill the whole unit.
    const { data: result } = await completeStructured({
      schema: UnitLessonsStrictSchema,
      validateSchema: UnitLessonsSchema,
      system: COURSE_GENERATOR_SYSTEM_PROMPT,
      prompt: buildUnitLessonsPrompt({
        brief: input.brief,
        settings,
        courseTitle: partial.title,
        unit: {
          shortLabel: unit.shortLabel,
          title: unit.title,
          subtitle: unit.subtitle,
          durationLabel: unit.durationLabel,
          lessons: unit.lessons.map((l) => ({
            title: l.title,
            summary: l.summary,
          })),
        },
      }),
      maxTokens: 8192,
    });

    // Per-block validation. UnitLessonsSchema is intentionally loose
    // (blocks: unknown[]) so a single bad block doesn't kill the whole
    // chunk — we filter here instead. If a model hallucinates a block
    // type that isn't in RichLessonBlockSchema's discriminator (e.g.
    // VIDEO, SLIDES) we drop just that entry and keep the valid ones.
    // If a lesson ends up with zero valid blocks, we fall back to a
    // stub stack so the teacher still has something to edit.
    const expected = unit.lessons.length;
    const lessons: RichLessonBlock[][] = result.lessons.map((l, lessonIdx) => {
      const valid: RichLessonBlock[] = [];
      let dropped = 0;
      // Sample the first rejected block + its Zod error so the log is
      // actually diagnostic — without this we just see "dropped N"
      // and have no idea what shape the model emitted.
      let firstReject: {
        block: unknown;
        issues: unknown;
      } | null = null;
      for (const raw of l.blocks) {
        const parsed = RichLessonBlockSchema.safeParse(raw);
        if (parsed.success) {
          valid.push(parsed.data);
        } else {
          dropped += 1;
          if (firstReject === null) {
            firstReject = {
              block: raw,
              issues: parsed.error.issues,
            };
          }
        }
      }
      if (dropped > 0) {
        console.warn("[processOutlineChunk] dropped invalid blocks", {
          jobId,
          unitIdx,
          lessonIdx,
          dropped,
          kept: valid.length,
          // Truncated sample so a huge block doesn't blow log size.
          sampleBlock:
            firstReject !== null
              ? JSON.stringify(firstReject.block).slice(0, 500)
              : null,
          sampleIssues: firstReject?.issues,
        });
      }
      // Empty lesson → stub. Better than persisting a content-less
      // shell the teacher has to debug.
      if (valid.length === 0) {
        return stubBlockStack(unit.lessons[lessonIdx]?.title ?? "Lesson");
      }
      return valid;
    });
    while (lessons.length < expected) {
      lessons.push(stubBlockStack(unit.lessons[lessons.length].title));
    }
    lessons.length = expected;

    return await advanceAfterRichLessons(jobId, partial, unitIdx, lessons);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[processOutlineChunk] chunk failed", { jobId, msg });
    await markFailed(jobId, msg);
    return { done: true };
  }
}

/**
 * Run a job inline, looping until done. Used as the fallback when
 * QStash isn't configured (local dev). Caller awaits to completion.
 *
 * NOTE: On Vercel Hobby without QStash, this will hit the 60s function
 * timeout the same as the old synchronous flow — but the same content
 * survives in the DB as `partial`, so a future re-attempt could pick
 * up. For now, the right answer in prod is "configure QStash".
 */
export async function runOutlineJobInline(jobId: string): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const { done } = await processOutlineChunk(jobId);
    if (done) return;
  }
  // Safety brake — should never trigger; means >20 chunks (unrealistic).
  console.warn("[runOutlineJobInline] exceeded 20 iterations", { jobId });
}

// ─── helpers ───

async function advanceAfterSkeleton(
  jobId: string,
  skeleton: OutlineSkeleton,
  mode: string
): Promise<{ done: boolean }> {
  // Hydrate skeleton into a partial Outline by adding empty
  // readingContent placeholders. Each unit gets readings filled in
  // by subsequent chunks.
  const partial: Outline = {
    title: skeleton.title,
    tagline: skeleton.tagline,
    description: skeleton.description,
    units: skeleton.units.map((u) => ({
      shortLabel: u.shortLabel,
      title: u.title,
      subtitle: u.subtitle,
      durationLabel: u.durationLabel,
      lessons: u.lessons.map(
        (l): OutlineLesson => ({
          title: l.title,
          summary: l.summary,
          // ≥120 chars so a fail-midway partial still passes
          // OutlineLessonSchema on save (see SKELETON_READING_PLACEHOLDER).
          readingContent: SKELETON_READING_PLACEHOLDER,
        })
      ),
    })),
  };
  const totalChunks = 1 + skeleton.units.length;
  await prisma.generationJob.update({
    where: { id: jobId },
    data: {
      partial: partial as unknown as Prisma.InputJsonValue,
      nextChunk: 1,
      totalChunks,
      progress: Math.round((1 / totalChunks) * 100),
      mode,
      step: `Outline ready — ${skeleton.units.length} units. Generating readings…`,
    },
  });
  if (isQStashEnabled()) {
    await enqueueOutlineChunk(jobId);
  }
  return { done: false };
}

/**
 * Merge a unit's full rich block stacks back into the partial outline.
 * Each lesson now carries a `blocks` array; we also keep `readingContent`
 * populated from the first READING block (if any) so the legacy code
 * paths (regenerateUnit, the saveAsCourse fallback) keep working.
 */
async function advanceAfterRichLessons(
  jobId: string,
  partial: Outline,
  unitIdx: number,
  lessonsBlocks: RichLessonBlock[][]
): Promise<{ done: boolean }> {
  const updated: Outline = {
    ...partial,
    units: partial.units.map((u, i) =>
      i !== unitIdx
        ? u
        : {
            ...u,
            lessons: u.lessons.map((l, j) => {
              const blocks = lessonsBlocks[j] ?? [];
              const readingBlock = blocks.find(
                (b): b is Extract<RichLessonBlock, { type: "READING" }> =>
                  b.type === "READING"
              );
              return {
                ...l,
                // Keep readingContent in sync with the first READING
                // block so anything that still reads it (legacy
                // saveAsCourse fallback, the regenerate-unit path)
                // sees the latest content.
                readingContent: readingBlock?.body ?? l.readingContent,
                blocks,
              };
            }),
          }
    ),
  };

  // Read latest job state for totalChunks (it was set during
  // advanceAfterSkeleton) — refetching is cheaper than threading state.
  const job = await prisma.generationJob.findUnique({ where: { id: jobId } });
  const totalChunks = job?.totalChunks ?? 1 + partial.units.length;
  const nextChunk = unitIdx + 2; // we just did unit (unitIdx), next is +1
  const isDone = nextChunk >= totalChunks;

  if (isDone) {
    await prisma.generationJob.update({
      where: { id: jobId },
      data: {
        status: "succeeded",
        partial: updated as unknown as Prisma.InputJsonValue,
        output: updated as unknown as Prisma.InputJsonValue,
        nextChunk,
        progress: 100,
        step: "Done",
      },
    });
    return { done: true };
  }

  await prisma.generationJob.update({
    where: { id: jobId },
    data: {
      partial: updated as unknown as Prisma.InputJsonValue,
      nextChunk,
      progress: Math.round((nextChunk / totalChunks) * 100),
      step: `${partial.units[unitIdx].shortLabel} content ready — moving on`,
    },
  });
  if (isQStashEnabled()) {
    await enqueueOutlineChunk(jobId);
  }
  return { done: false };
}

/**
 * Stub block stack used in demo mode and as padding when the model
 * returns fewer lessons than the skeleton declared. Honest about
 * being a placeholder so teachers + students can tell at a glance.
 */
function stubBlockStack(lessonTitle: string): RichLessonBlock[] {
  return [
    {
      type: "READING",
      label: "Read this first",
      body:
        `Placeholder reading for "${lessonTitle}". The AI builder is running ` +
        `in demo mode because no AI provider key is configured on this ` +
        `deployment. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in Vercel ` +
        `and regenerate to get real, grade-appropriate content.`,
    },
    {
      type: "DISCUSSION",
      label: "Talk it over",
      prompt:
        `What do you think this lesson is about, just from the title "${lessonTitle}"?`,
    },
  ];
}

async function markFailed(jobId: string, message: string): Promise<void> {
  await prisma.generationJob.update({
    where: { id: jobId },
    data: { status: "failed", error: message },
  });
}

function buildDemoSkeleton(
  brief: string,
  settings: GeneratorSettings
): OutlineSkeleton {
  // Minimal honest stub — same shape, no real content. Used only when
  // both ANTHROPIC_API_KEY and OPENAI_API_KEY are missing.
  const _ = brief;
  return {
    title: `Course · ${settings.grade}`,
    tagline: "Demo outline — no AI provider configured.",
    description:
      "This is a placeholder skeleton. Set ANTHROPIC_API_KEY or OPENAI_API_KEY on the deployment and regenerate to get real content.",
    units: [
      {
        shortLabel: "Unit 1",
        title: "Unit one",
        subtitle: "Placeholder unit",
        durationLabel: "1 hr",
        lessons: [
          { title: "Lesson A", summary: "Placeholder lesson A" },
          { title: "Lesson B", summary: "Placeholder lesson B" },
          { title: "Lesson C", summary: "Placeholder lesson C" },
        ],
      },
    ],
  };
}

