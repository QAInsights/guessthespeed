/// <reference types="node" />

import { existsSync } from "node:fs";
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
    for (const promo of PROMOS) {
      expect(promo.blurb.length).toBeLessThanOrEqual(110);
      expect(Object.values(promo).join("")).not.toContain("\u2014");
    }
  });
});
