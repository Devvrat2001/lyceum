import { z } from "zod";

/**
 * Hand-rolled Zod → JSON Schema converter that produces the subset
 * Anthropic / OpenAI structured outputs accept (no minLength/maxLength,
 * no $ref). Kept small to avoid pulling in a heavy dep just for this.
 *
 * Shared by `generator.outline`, `generator.regenerateUnit`,
 * `generator.generateQuestions`, `teacher.generateAiQuiz`, and the
 * rich-block schemas in the course-builder worker. When we need
 * richer schema features (refinements, conditional shapes), extend
 * here rather than per-caller.
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
  if (schema instanceof z.ZodBoolean) {
    const out: Record<string, unknown> = { type: "boolean" };
    if (schema.description) out.description = schema.description;
    return out;
  }
  if (schema instanceof z.ZodLiteral) {
    // const-value schema (used as discriminator tags). OpenAI's strict
    // mode rejects bare `const` without `enum`, so we emit both forms
    // — JSON Schema validators accept either, and the model still
    // gets the single allowed value.
    const value = schema.value;
    return { const: value, enum: [value] };
  }
  if (schema instanceof z.ZodEnum) {
    return { type: "string", enum: schema.options };
  }
  if (
    schema instanceof z.ZodDiscriminatedUnion ||
    schema instanceof z.ZodUnion
  ) {
    // Discriminated unions are how the rich-block schemas branch
    // (READING vs MCQ vs DRAG_MATCH …). JSON Schema's `anyOf` is the
    // closest equivalent — each branch is one full object schema.
    // OpenAI structured outputs / Anthropic both interpret anyOf
    // correctly when each branch has a literal `type` field, which
    // the discriminator gives us for free.
    //
    // Both ZodUnion and ZodDiscriminatedUnion expose `.options` as
    // an iterable of branch schemas; we treat them uniformly here
    // and let the TS structural type widen via the `as` cast.
    const options = (schema as { options: Iterable<z.ZodTypeAny> }).options;
    const optsArr: z.ZodTypeAny[] = Array.from(options);
    return {
      anyOf: optsArr.map((o) => zodToJsonSchema(o)),
    };
  }
  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema.unwrap() as z.ZodTypeAny);
  }
  if (schema instanceof z.ZodDefault) {
    return zodToJsonSchema(schema.removeDefault() as z.ZodTypeAny);
  }
  return { type: "string" };
}
