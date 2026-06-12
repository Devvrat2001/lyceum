/**
 * i18n catalog parity. Every locale must define exactly the same set of
 * message keys — a missing key means a string silently falls back (or throws)
 * at runtime in that locale. This guards against translation drift as keys are
 * added: add a key to en.json and forget es.json, and this fails.
 */
import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import { LOCALES } from "@/i18n/locales";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import hi from "@/messages/hi.json";

type Json = Record<string, unknown>;

/** Flattened dotted key paths for every leaf string in a catalog. */
function keyPaths(obj: Json, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return v && typeof v === "object"
      ? keyPaths(v as Json, path)
      : [path];
  });
}

const catalogs: Record<string, Json> = { en, es, hi };

describe("i18n message catalogs", () => {
  it("ships a catalog for every registered locale", () => {
    for (const locale of LOCALES) {
      expect(catalogs[locale], `missing catalog for "${locale}"`).toBeDefined();
    }
  });

  it("has identical key sets across locales (no drift)", () => {
    const reference = keyPaths(en).sort();
    for (const locale of LOCALES) {
      const keys = keyPaths(catalogs[locale]).sort();
      expect(keys, `key drift in "${locale}"`).toEqual(reference);
    }
  });

  it("has no empty translations", () => {
    for (const locale of LOCALES) {
      const flat = (obj: Json, prefix = ""): void => {
        for (const [k, v] of Object.entries(obj)) {
          const path = prefix ? `${prefix}.${k}` : k;
          if (v && typeof v === "object") flat(v as Json, path);
          else expect(String(v).trim(), `empty "${path}" in ${locale}`).not.toBe("");
        }
      };
      flat(catalogs[locale]);
    }
  });

  it("compiles + formats the parameterized ICU strings in every locale", () => {
    // The parity tests can't catch a syntactically broken ICU string
    // (unbalanced brace, bad plural arg) — that would only explode at
    // render time in that locale. createTranslator runs the same
    // compile + format pipeline the app uses, off-React.
    for (const locale of LOCALES) {
      // `as typeof en` gives createTranslator the key structure for
      // inference — safe because the parity test above proves every
      // catalog has exactly en's key set.
      const t = createTranslator({
        locale,
        messages: catalogs[locale] as typeof en,
      });
      expect(
        t("StudentDashboard.welcome", { name: "Asha" }),
        `welcome in ${locale}`
      ).toContain("Asha");
      expect(
        t("StudentDashboard.badgeCount", { earned: 2, total: 9 }),
        `badgeCount in ${locale}`
      ).toMatch(/2/);
      expect(t("TodaysPlan.title"), `plan title in ${locale}`).not.toBe("");
    }
  });
});
