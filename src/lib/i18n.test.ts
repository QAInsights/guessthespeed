import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { localizedPath } from "./i18n";

const messagesDir = join(process.cwd(), "messages");
const catalogs = Object.fromEntries(
  ["en", "ta", "es"].map((locale) => [
    locale,
    JSON.parse(
      readFileSync(join(messagesDir, `${locale}.json`), "utf8"),
    ) as Record<string, string>,
  ]),
) as Record<"en" | "ta" | "es", Record<string, string>>;

function placeholders(message: string): string[] {
  return [...message.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)]
    .map((match) => match[1])
    .sort();
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx|js|mjs|astro)$/.test(entry.name) &&
      !/\.test\./.test(entry.name)
      ? [path]
      : [];
  });
}

describe("localization catalogs", () => {
  it("has identical message keys and placeholders in every locale", () => {
    const keys = Object.keys(catalogs.en).sort();
    expect(Object.keys(catalogs.ta).sort()).toEqual(keys);
    expect(Object.keys(catalogs.es).sort()).toEqual(keys);
    for (const key of keys) {
      expect(placeholders(catalogs.ta[key]), `ta.${key}`).toEqual(
        placeholders(catalogs.en[key]),
      );
      expect(placeholders(catalogs.es[key]), `es.${key}`).toEqual(
        placeholders(catalogs.en[key]),
      );
    }
  });

  it("contains no em dashes and translates every non-allowlisted message", () => {
    const unchangedAllowlist = new Set([
      "brand_name",
      "unit_mbps",
      "unit_ms",
      "language_english",
      "language_tamil",
      "language_spanish",
      "language_hint_ta",
      "language_hint_es",
      "footer_github",
      "dev_asn",
      "dev_warp",
    ]);
    const unchangedSpanishAllowlist = new Set(["header_theme_auto"]);
    for (const key of Object.keys(catalogs.en)) {
      for (const locale of ["en", "ta", "es"] as const) {
        expect(catalogs[locale][key], `${locale}.${key}`).not.toContain(
          String.fromCodePoint(0x2014),
        );
      }
      if (unchangedAllowlist.has(key)) continue;
      expect(catalogs.ta[key], `ta.${key}`).not.toBe(catalogs.en[key]);
      if (!unchangedSpanishAllowlist.has(key)) {
        expect(catalogs.es[key], `es.${key}`).not.toBe(catalogs.en[key]);
      }
    }
  });

  it("does not write document cookies in application source", () => {
    const writesCookie = /\b(?:document|window\.document)\.cookie\s*=/;
    const generatedDir = join(process.cwd(), "src", "paraglide");
    const files = sourceFiles(join(process.cwd(), "src")).filter(
      (file) => !file.startsWith(`${generatedDir}/`),
    );
    for (const file of files) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(writesCookie);
    }
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    expect(packageJson.scripts.i18n).toContain(
      "--strategy globalVariable baseLocale",
    );
  });
});

describe("localizedPath", () => {
  it.each([
    ["en", "/", "/"],
    ["en", "/classroom/", "/classroom/"],
    ["en", "/work/", "/work/"],
    ["ta", "/", "/ta/"],
    ["ta", "/classroom/", "/ta/classroom/"],
    ["ta", "/work/", "/ta/work/"],
    ["es", "/", "/es/"],
    ["es", "/classroom/", "/es/classroom/"],
    ["es", "/work/", "/es/work/"],
  ] as const)("maps %s %s to %s", (locale, path, expected) => {
    expect(localizedPath(path, locale)).toBe(expected);
  });
});
