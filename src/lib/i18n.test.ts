import { describe, expect, it } from "vitest";
import projectSettings from "../../project.inlang/settings.json";
import {
  formatNumber,
  isLocale,
  LOCALE_STORAGE_KEY,
  LOCALES,
  localeHome,
} from "./i18n";

describe("locale metadata", () => {
  it("recognizes only supported locales", () => {
    expect(LOCALES.every(isLocale)).toBe(true);
    expect(isLocale("ta")).toBe(true);
    expect(isLocale("en-US")).toBe(false);
    expect(isLocale(null)).toBe(false);
  });

  it("maps locales to their home URLs", () => {
    expect(localeHome("en")).toBe("/");
    expect(localeHome("ta")).toBe("/ta/");
  });

  it("matches the Paraglide project locale list", () => {
    expect(LOCALES).toEqual(projectSettings.locales);
  });

  it("uses the stable locale storage key", () => {
    expect(LOCALE_STORAGE_KEY).toBe("gts:locale");
  });
});

describe("formatNumber", () => {
  it("formats English and German decimal separators", () => {
    expect(formatNumber(1234.5, "en")).toBe("1,234.5");
    expect(formatNumber(1234.5, "de")).toBe("1.234,5");
  });

  it("uses Indian grouping for Hindi", () => {
    expect(formatNumber(100000, "hi")).toBe("1,00,000");
  });

  it("uses French narrow no-break-space grouping", () => {
    expect(formatNumber(1234.5, "fr")).toBe("1\u202f234,5");
  });

  it("uses Latin digits for Tamil", () => {
    expect(formatNumber(12345, "ta")).toBe("12,345");
  });

  it("preserves supplied fraction-digit options", () => {
    expect(
      formatNumber(1.234, "de", {
        maximumFractionDigits: 1,
        minimumFractionDigits: 1,
      }),
    ).toBe("1,2");
  });
});
