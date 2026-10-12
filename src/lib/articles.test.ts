import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ARTICLE_CATEGORIES, ARTICLES } from "./articles";
import { ogCards } from "./og-cards";

describe("Speed School articles", () => {
  it("points every entry at a real page with a share card", () => {
    for (const { path } of ARTICLES) {
      expect(path).toMatch(/^\/[a-z0-9-]+\/$/);
      expect(existsSync(`src/pages${path.slice(0, -1)}.astro`)).toBe(true);
      expect(ogCards.some((card) => card.path === path)).toBe(true);
    }
  });

  it("has unique paths, valid dates and newest-first order", () => {
    expect(new Set(ARTICLES.map((a) => a.path)).size).toBe(ARTICLES.length);
    const dates = ARTICLES.map((a) => a.published);
    for (const date of dates) {
      expect(Number.isNaN(Date.parse(`${date}T12:00:00Z`))).toBe(false);
    }
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("uses every category at least once", () => {
    for (const category of ARTICLE_CATEGORIES) {
      expect(ARTICLES.some((a) => a.category === category)).toBe(true);
    }
  });
});
