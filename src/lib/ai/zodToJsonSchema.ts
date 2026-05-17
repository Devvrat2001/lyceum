import { z } from "zod";

/**
 * Hand-rolled Zod → JSON Schema converter that produces the subset
 * Anthropic structured outputs accepts (no minLength/maxLength etc).
 * Kept small to avoid pulling in a heavy dep just for this.
 *
 * Shared by `generator.outline`, `generator.regenerateUnit`,
 * `generator.generateQuestions`, and `teacher.generateAiQuiz`. When
 * we need richer schema features (enums, refinements), extend here
 * rather than per-caller.
 */
export function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
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
