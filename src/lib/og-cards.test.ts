import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getIconData } from "@iconify/utils";
import { ogCardFor, ogCards, ogImagePath, ogSlug } from "./og-cards";

const require = createRequire(import.meta.url);
const phIconSet = require("@iconify-json/ph/icons.json") as Parameters<
  typeof getIconData
>[0];

const pagePaths = readdirSync(new URL("../pages/", import.meta.url), {
  withFileTypes: true,
})
  .filter((entry) => entry.isFile() && entry.name.endsWith(".astro"))
  .map((entry) => entry.name)
  .filter((name) => name !== "404.astro")
  .map((name) =>
    name === "index.astro" ? "/" : `/${name.replace(/\.astro$/, "")}/`,
  );

describe("OG cards", () => {
  it("provides a card for every page except the custom 404 page", () => {
    expect(ogCards.map(({ path }) => path).sort()).toEqual(pagePaths.sort());
  });

  it("has unique paths and slugs", () => {
    const paths = ogCards.map(({ path }) => path);
    const slugs = paths.map(ogSlug);

    expect(new Set(paths).size).toBe(paths.length);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(ogSlug("/")).toBe("home");
    expect(ogSlug("/mbps-to-mbs/")).toBe("mbps-to-mbs");
  });

  it("falls back to the home card for unknown paths", () => {
    expect(ogImagePath("/not-a-page/")).toBe("/og/home.png");
  });

  it("normalizes paths when selecting a card", () => {
    const statsCard = ogCards.find((card) => card.path === "/stats/");

    expect(ogCardFor("/stats")).toEqual(statsCard);
    expect(ogCardFor("/stats/")).toEqual(statsCard);
  });

  it("contains no em dashes in card copy", () => {
    const emDash = String.fromCharCode(0x2014);
    for (const card of ogCards) {
      expect(
        [card.kicker, card.line1, card.line2, card.subtitle].join(" "),
      ).not.toContain(emDash);
    }
  });

  it("uses icons from the Phosphor set", () => {
    for (const { icon } of ogCards) {
      const [prefix, name] = icon.split(":");

      expect(prefix).toBe(phIconSet.prefix);
      expect(getIconData(phIconSet, name)).toBeTruthy();
    }
  });
});
