import { describe, expect, it } from "vitest";
import { ROOM_ERROR_CODES } from "./room";
import { themes } from "./themes";
import * as m from "../paraglide/messages.js";
import enMessages from "../../messages/en.json";
import taMessages from "../../messages/ta.json";
import hiMessages from "../../messages/hi.json";
import esMessages from "../../messages/es.json";
import ptMessages from "../../messages/pt.json";
import frMessages from "../../messages/fr.json";
import deMessages from "../../messages/de.json";

type Catalog = Record<string, unknown>;

const english = enMessages as Catalog;
const catalogs: Record<string, Catalog> = {
  en: enMessages as Catalog,
  ta: taMessages as Catalog,
  hi: hiMessages as Catalog,
  es: esMessages as Catalog,
  pt: ptMessages as Catalog,
  fr: frMessages as Catalog,
  de: deMessages as Catalog,
};
const englishKeys = Object.keys(english).sort();

function messageTexts(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) return [];

  return value.flatMap((variant) => {
    if (!variant || typeof variant !== "object") return [];
    const match = (variant as { match?: unknown }).match;
    return match && typeof match === "object" && !Array.isArray(match)
      ? Object.values(match).filter(
          (message): message is string => typeof message === "string",
        )
      : [];
  });
}

function messageParams(value: unknown): Set<string> {
  const params = new Set<string>();
  if (Array.isArray(value)) {
    for (const variant of value) {
      if (!variant || typeof variant !== "object") continue;
      const declarations = (variant as { declarations?: unknown }).declarations;
      if (Array.isArray(declarations))
        for (const declaration of declarations) {
          if (typeof declaration !== "string") continue;
          const input = declaration.match(/^input\s+([A-Za-z_]\w*)$/);
          if (input) params.add(input[1]);
        }
    }
  }
  for (const message of messageTexts(value))
    for (const match of message.matchAll(/\{([A-Za-z_]\w*)\}/g))
      params.add(match[1]);
  return params;
}

describe("message catalogs", () => {
  it("contains the same keys in every locale", () => {
    for (const [file, catalog] of Object.entries(catalogs)) {
      expect(Object.keys(catalog).sort(), file).toEqual(englishKeys);
      expect(catalog, file).toEqual(english);
    }
  });

  it("preserves every English message parameter in each locale", () => {
    for (const [file, catalog] of Object.entries(catalogs)) {
      for (const key of englishKeys) {
        expect([...messageParams(catalog[key])], `${file}: ${key}`).toEqual(
          expect.arrayContaining([...messageParams(english[key])]),
        );
      }
    }
  });

  it("contains no em dashes or empty messages", () => {
    for (const [file, catalog] of Object.entries(catalogs)) {
      for (const [key, value] of Object.entries(catalog)) {
        const messages = messageTexts(value);
        expect(messages.length, `${file}: ${key}`).toBeGreaterThan(0);
        for (const message of messages) {
          expect(message, `${file}: ${key}`).not.toContain("—");
          expect(message.trim(), `${file}: ${key}`).not.toBe("");
        }
      }
    }
  });

  it("formats singular and plural variants", () => {
    expect(
      m.settings_round_option({ count: 1, formatted: "1" }, { locale: "en" }),
    ).toBe("1 round");
    expect(
      m.settings_round_option({ count: 3, formatted: "3" }, { locale: "en" }),
    ).toBe("3 rounds");
    expect(m.game_points_unit({ count: 1 }, { locale: "en" })).toBe("pt");
    expect(m.game_points_unit({ count: 3 }, { locale: "en" })).toBe("pts");
  });

  it("includes every room-error and theme message", () => {
    for (const code of ROOM_ERROR_CODES)
      expect(english).toHaveProperty(`room_error_${code}`);
    for (const id of Object.keys(themes))
      expect(english).toHaveProperty(`theme_${id}`);
  });
});
