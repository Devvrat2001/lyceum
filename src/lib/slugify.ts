/**
 * URL-safe slug from a human title. Single source of truth — the teacher
 * and generator routers used to carry near-identical private copies (the
 * generator's capped at 80 chars, the teacher's didn't); unified on the
 * capped behaviour since callers all run a unique-suffix loop anyway and
 * an uncapped slug just makes ugly URLs.
 */
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
