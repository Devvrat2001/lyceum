import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export type AuditKind =
  | "ai.tutor"
  | "ai.course_outline"
  | "ai.regenerate_unit"
  | "ai.generate_questions"
  | "ai.marketplace_search"
  | "ai.why_path"
  | "ai.suggest_fix"
  | "ai.send_nudge"
  | "auth.signup"
  | "course.publish"
  | "course.unpublish"
  | "course.update"
  | "payment.refund_initiated"
  | "teacher.invite_student";

type AuditInput = {
  actorId?: string | null;
  kind: AuditKind;
  payload: Record<string, unknown>;
  lessonId?: string | null;
  courseId?: string | null;
};

/**
 * Write a single audit row. Fire-and-forget: errors are logged but
 * never thrown, so a transient DB hiccup can't kill an in-flight AI
 * stream. Every AI mutation in the codebase calls this exactly once.
 */
export async function audit(input: AuditInput): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        kind: input.kind,
        payload: sanitize(input.payload) as Prisma.InputJsonValue,
        lessonId: input.lessonId ?? null,
        courseId: input.courseId ?? null,
      },
    });
  } catch (err) {
    console.error("[audit]", input.kind, err);
  }
}

/**
 * Strip obvious secret-looking keys before persisting. The audit table
 * is admin-visible; we never want an API key leaking into it.
 */
function sanitize(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (/api[_-]?key|secret|token|password|authorization/i.test(k)) {
      out[k] = "[redacted]";
      continue;
    }
    if (typeof v === "string" && v.length > 4000) {
      out[k] = v.slice(0, 4000) + " …[truncated]";
    } else {
      out[k] = v;
    }
  }
  return out;
}
