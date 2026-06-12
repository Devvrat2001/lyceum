/**
 * Syllabus-paste prompt wiring (REQUIREMENTS R24 v1). A pasted syllabus
 * must reach the outline-level prompts as a source-of-truth section —
 * and stay out of them when absent — without ever calling an LLM (these
 * are pure prompt-builder functions).
 */
import { describe, expect, it } from "vitest";
import {
  SettingsSchema,
  buildCourseGenPrompt,
  buildOutlineSkeletonPrompt,
  syllabusPromptSection,
} from "@/lib/ai/prompts/courseGenerator";

const settings = SettingsSchema.parse({});
const brief = "A 4-unit course on cell biology for Grade 8 with labs.";
const syllabus =
  "Term 1: Cell structure (organelles, membranes)\nTerm 2: Photosynthesis and respiration";

describe("syllabus prompt section (R24)", () => {
  it("skeleton prompt embeds the pasted syllabus + source-of-truth rules", () => {
    const prompt = buildOutlineSkeletonPrompt({ brief, settings, syllabus });
    expect(prompt).toContain("Their syllabus:");
    expect(prompt).toContain("source of truth for scope and sequence");
    expect(prompt).toContain("Term 2: Photosynthesis and respiration");
    // The brief still leads the prompt — syllabus augments, not replaces.
    expect(prompt).toContain(brief);
  });

  it("sync outline prompt embeds it the same way", () => {
    const prompt = buildCourseGenPrompt({ brief, settings, syllabus });
    expect(prompt).toContain("Their syllabus:");
    expect(prompt).toContain("Term 1: Cell structure");
  });

  it("omits the section entirely when absent or whitespace-only", () => {
    for (const empty of [undefined, "", "   \n\t "]) {
      const prompt = buildOutlineSkeletonPrompt({
        brief,
        settings,
        syllabus: empty,
      });
      expect(prompt).not.toContain("Their syllabus:");
      expect(prompt).not.toContain("source of truth");
    }
    expect(syllabusPromptSection("  ")).toBe("");
  });
});
