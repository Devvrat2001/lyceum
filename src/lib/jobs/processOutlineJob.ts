import "server-only";
import type { Prisma } from "@prisma/client";
import { db as prisma } from "@/lib/db";
import {
  OutlineSkeletonSchema,
  UnitLessonsSchema,
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
    const partial = job.partial as unknown as Outline | null;
    if (!partial) {
      await markFailed(jobId, "Partial outline missing on chunk run");
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
    const { data: result } = await completeStructured({
      schema: UnitLessonsSchema,
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

    // Pad/truncate to expected length so a model that returns N±1
    // lessons doesn't corrupt the merge. Missing lessons get a stub
    // block stack so the lesson row still has SOMETHING when the
    // teacher opens it in the editor.
    const expected = unit.lessons.length;
    const lessons: RichLessonBlock[][] = result.lessons.map(
      (l) => l.blocks as RichLessonBlock[]
    );
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
          // Long enough to pass OutlineLessonSchema's min(120) on save
          // if a chunk fails midway — the user can still ship a course
          // with these placeholders + edit them.
          readingContent:
            "(reading not yet generated — the next chunk will replace this with a real 80-180 word reading for this lesson)",
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

