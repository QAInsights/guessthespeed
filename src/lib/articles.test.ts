import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ARTICLE_CATEGORIES, ARTICLES } from "./articles";
import { ogCardFor, ogCards } from "./og-cards";
import {
  SCHOOL_PAGE_COUNT,
  SCHOOL_PAGE_SIZE,
  schoolPageArticles,
  schoolPagePath,
} from "./speed-school";

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

  it("gives every article a short TL;DR", () => {
    for (const { tldr, updated, published } of ARTICLES) {
      expect(tldr.length).toBeGreaterThanOrEqual(3);
      expect(tldr.length).toBeLessThanOrEqual(4);
      for (const point of tldr) expect(point).not.toMatch(/\u2014/);
      if (updated) expect(updated >= published).toBe(true);
    }
  });

  it("paginates every article exactly once", () => {
    const paged = Array.from({ length: SCHOOL_PAGE_COUNT }, (_, i) =>
      schoolPageArticles(i + 1),
    );
    expect(paged.flat()).toEqual(ARTICLES);
    for (const list of paged) {
      expect(list.length).toBeGreaterThan(0);
      expect(list.length).toBeLessThanOrEqual(SCHOOL_PAGE_SIZE);
    }
    expect(schoolPagePath(1)).toBe("/speed-school/");
    expect(schoolPagePath(2)).toBe("/speed-school/page/2/");
    expect(ogCardFor("/speed-school/page/2/").path).toBe("/speed-school/");
  });
});
