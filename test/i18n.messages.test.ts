/**
 * i18n catalog parity. Every locale must define exactly the same set of
 * message keys — a missing key means a string silently falls back (or throws)
 * at runtime in that locale. This guards against translation drift as keys are
 * added: add a key to en.json and forget es.json, and this fails.
 */
import { describe, expect, it } from "vitest";
import { LOCALES } from "@/i18n/locales";
import en from "@/messages/en.json";
import es from "@/messages/es.json";

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

const catalogs: Record<string, Json> = { en, es };

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
});
