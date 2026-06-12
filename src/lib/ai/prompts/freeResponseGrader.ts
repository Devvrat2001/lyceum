import { z } from "zod";

/**
 * Free-response grading (REQUIREMENTS R24). The student's short written
 * answer is scored 0-100 against the teacher's rubric, with feedback
 * written TO the student. `completeStructured` handles the LLM
 * round-trip; `buildDemoGrade` keeps the block fully functional when no
 * provider key is configured (keyword-overlap heuristic, honest about
 * being demo mode).
 */

export const GradeSchema = z.object({
  score: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe(
      "0-100 against the rubric only. 100 = covers every rubric idea correctly; 60 = solid grasp with gaps; below 40 = mostly off-target. Don't deduct for spelling/grammar unless the rubric asks."
    ),
  feedback: z
    .string()
    .describe(
      "2-4 sentences addressed to the student ('you'). Encouraging, specific, grade-appropriate. Plain prose, no markdown. Open with what they got right, then the single most important gap."
    ),
  strengths: z
    .array(z.string())
    .describe("1-3 short phrases naming what the answer did well."),
  improvements: z
    .array(z.string())
    .describe(
      "1-3 short phrases naming what to add or fix — concrete, not generic ('explain WHY the shadow shrinks', not 'add detail')."
    ),
});

export type FreeResponseGrade = z.infer<typeof GradeSchema>;

export const FREE_RESPONSE_GRADER_SYSTEM_PROMPT = `You are Lyceum's K-12 writing grader.
You grade a student's short written answer against the teacher's rubric.

Rules:
1. Grade against the rubric ONLY — not against everything you know about
   the topic. If the rubric is thin, grade against the prompt's plain
   intent.
2. Be encouraging and specific. The reader is a school student; feedback
   that stings teaches nothing. Open with what they got right.
3. Never deduct for spelling, grammar, or short sentences unless the
   rubric explicitly asks for writing mechanics.
4. A score of 60 means "passing grasp" — reserve 90+ for answers that
   cover essentially every rubric idea in the student's own words.
5. An answer that ignores the prompt, is gibberish, or was clearly
   pasted from elsewhere without engaging the question scores below 30.
6. Feedback is plain prose addressed to the student. No markdown, no
   bullet characters, no "the student" third person.`;

export function buildGradingPrompt(args: {
  courseTitle: string;
  lessonTitle: string;
  prompt: string;
  rubric: string;
  answer: string;
}): string {
  const { courseTitle, lessonTitle, prompt, rubric, answer } = args;
  return `Course: "${courseTitle}"
Lesson: "${lessonTitle}"

The teacher asked:
"""
${prompt.trim()}
"""

Teacher's rubric (what a strong answer covers — the student never sees this):
"""
${rubric.trim() || "(none provided — grade against the prompt's plain intent)"}
"""

The student wrote:
"""
${answer.trim()}
"""

Grade the answer per your rules. Output ONLY the JSON object.`;
}

/**
 * Demo-mode grade when no AI provider is configured: keyword overlap
 * between the rubric and the answer, plus a length factor. Honest about
 * being a heuristic — the feedback says so outright, mirroring how the
 * demo outline/tutor behave without keys.
 */
export function buildDemoGrade(args: {
  rubric: string;
  answer: string;
}): FreeResponseGrade {
  const terms = Array.from(
    new Set(
      (args.rubric.toLowerCase().match(/[a-zऀ-ॿ]{4,}/g) ?? []).slice(
        0,
        40
      )
    )
  );
  const answerLower = args.answer.toLowerCase();
  const hit = terms.filter((t) => answerLower.includes(t));
  const missed = terms.filter((t) => !answerLower.includes(t));
  const coverage = terms.length > 0 ? hit.length / terms.length : 0.5;
  const words = args.answer.trim().split(/\s+/).filter(Boolean).length;
  const lengthFactor = Math.max(0, Math.min(1, words / 40));
  const score = Math.round(
    Math.max(0, Math.min(100, 100 * (0.7 * coverage + 0.3 * lengthFactor)))
  );
  return {
    score,
    feedback:
      `Demo grading (no AI key is configured on this deployment): your ` +
      `answer matched ${hit.length} of ${terms.length || 0} key ideas from ` +
      `the rubric. Set ANTHROPIC_API_KEY or OPENAI_API_KEY and resubmit ` +
      `for real feedback on your writing.`,
    strengths: hit.slice(0, 3).map((t) => `mentioned "${t}"`),
    improvements: missed.slice(0, 3).map((t) => `cover "${t}"`),
  };
}
