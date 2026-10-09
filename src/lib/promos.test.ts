/// <reference types="node" />

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pickPromo, PROMOS } from "./promos";

describe("pickPromo", () => {
  it("picks the first item when random is zero", () => {
    expect(pickPromo(PROMOS, () => 0)).toBe(PROMOS[0]);
  });

  it("picks the last item when random is near one", () => {
    expect(pickPromo(PROMOS, () => 0.999)).toBe(PROMOS[PROMOS.length - 1]);
  });

  it("clamps random values of one to the last item", () => {
    expect(pickPromo(PROMOS, () => 1)).toBe(PROMOS[PROMOS.length - 1]);
  });

  it("returns null for an empty list", () => {
    expect(pickPromo([])).toBeNull();
  });
});

describe("PROMOS", () => {
  it("contains four promos with unique ids", () => {
    expect(PROMOS).toHaveLength(4);
    expect(new Set(PROMOS.map(({ id }) => id)).size).toBe(PROMOS.length);
  });

  it("uses a dark tile behind the ai.dosa.dev logo", () => {
    expect(PROMOS.find(({ id }) => id === "dosa")?.tile).toBe("#0a0a0a");
  });

  it("uses secure links and existing local promo images", () => {
    for (const promo of PROMOS) {
      expect(promo.href).toMatch(/^https:\/\//);
      expect(promo.image).toMatch(/^\/promos\//);
      expect(
        existsSync(join(process.cwd(), "public", promo.image.slice(1))),
      ).toBe(true);
    }
  });

  it("keeps blurbs short and promo copy free of em dashes", () => {
    const catalogs = Object.fromEntries(
      ["en", "ta", "es"].map((locale) => [
        locale,
        JSON.parse(
          readFileSync(
            join(process.cwd(), "messages", `${locale}.json`),
            "utf8",
          ),
        ) as Record<string, string>,
      ]),
    );
    for (const promo of PROMOS) {
      expect(Object.values(promo).join("")).not.toContain("\u2014");
      for (const locale of ["en", "ta", "es"]) {
        expect(catalogs[locale][promo.blurbKey].length).toBeLessThanOrEqual(
          110,
        );
        expect(catalogs[locale][promo.ctaKey]).toBeTruthy();
      }
    }
  });
});
