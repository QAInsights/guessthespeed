import { describe, expect, it, vi } from "vitest";
import {
  buildPodiumEntries,
  buildSharePayload,
  buildShareText,
  joinNames,
  SHARE_URL,
} from "./share";

describe("share results", () => {
  it("formats a single winner and top-three podium", () => {
    expect(
      buildShareText({
        players: [
          { name: "Little One", score: 9 },
          { name: "Big Sis", score: 6 },
          { name: "Dad", score: 1 },
        ],
      }),
    ).toBe(
      `🏆 Little One won Guess the Speed!\n🥇 Little One 9 pts · 🥈 Big Sis 6 pts · 🥉 Dad 1 pt\nCan your family beat us? ${SHARE_URL}`,
    );
  });

  it("formats a two-way tie", () => {
    expect(
      buildShareText({
        players: [
          { name: "Mom", score: 8 },
          { name: "Dad", score: 8 },
          { name: "Sister", score: 2 },
        ],
      }),
    ).toContain("🏆 Mom and Dad tied for the win at Guess the Speed!");
  });

  it("joins three-way tie names with commas and and", () => {
    expect(joinNames(["A", "B", "C"])).toBe("A, B and C");
    expect(
      buildShareText({
        players: [
          { name: "A", score: 5 },
          { name: "B", score: 5 },
          { name: "C", score: 5 },
        ],
      }),
    ).toContain("🏆 A, B and C tied for the win at Guess the Speed!");
  });

  it("shares second-place medals and skips the occupied next place", () => {
    expect(
      buildPodiumEntries([
        { name: "First", score: 9 },
        { name: "Second", score: 6 },
        { name: "Also second", score: 6 },
        { name: "Fourth", score: 2 },
      ]).map(({ player, place, medal }) => [player.name, place, medal]),
    ).toEqual([
      ["First", 1, "🥇"],
      ["Second", 2, "🥈"],
      ["Also second", 2, "🥈"],
    ]);
    expect(
      buildShareText({
        players: [
          { name: "First", score: 9 },
          { name: "Second", score: 6 },
          { name: "Also second", score: 6 },
          { name: "Fourth", score: 2 },
        ],
      }),
    ).toContain("🥇 First 9 pts · 🥈 Second 6 pts · 🥈 Also second 6 pts");
  });

  it("includes every player tied for a podium place", () => {
    const entries = buildPodiumEntries([
      { name: "One", score: 10 },
      { name: "Two", score: 10 },
      { name: "Three", score: 10 },
      { name: "Four", score: 10 },
    ]);
    expect(entries).toHaveLength(4);
    expect(entries.map(({ place, medal }) => [place, medal])).toEqual(
      Array.from({ length: 4 }, () => [1, "🥇"]),
    );
  });

  it("uses singular and plural point labels", () => {
    const text = buildShareText({
      players: [
        { name: "One point", score: 1 },
        { name: "Two points", score: 2 },
      ],
    });
    expect(text).toContain("🥇 Two points 2 pts");
    expect(text).toContain("🥈 One point 1 pt");
  });

  it("adds the latest actual speeds using the results formatting", () => {
    const withActual = buildShareText({
      players: [{ name: "Ada", score: 3 }],
      lastActual: { down: 1234.5, up: 8.25 },
    });
    expect(withActual).toContain(
      "Our internet hit 1,234.5 Mbps down and 8.3 Mbps up.",
    );
    expect(
      buildShareText({ players: [{ name: "Ada", score: 3 }] }),
    ).not.toContain("Our internet hit");
  });

  it("formats share speeds with en-US grouping regardless of runtime locale", () => {
    const localeSpy = vi
      .spyOn(Number.prototype, "toLocaleString")
      .mockImplementation(function (
        this: number,
        locales?: Intl.LocalesArgument,
        options?: Intl.NumberFormatOptions,
      ) {
        if (locales === undefined) return "1.234,5";
        return new Intl.NumberFormat(locales, options).format(this);
      });

    try {
      expect(
        buildShareText({
          players: [{ name: "Ada", score: 3 }],
          lastActual: { down: 1234.5, up: 45.5 },
        }),
      ).toContain("1,234.5 Mbps down and 45.5 Mbps up.");
    } finally {
      localeSpy.mockRestore();
    }
  });

  it("uses the friendly fallback when there are no players or all scores are zero", () => {
    const fallback = `We just played Guess the Speed! Can your family beat us? ${SHARE_URL}`;
    expect(buildShareText({ players: [] })).toBe(fallback);
    expect(
      buildShareText({
        players: [
          { name: "Mom", score: 0 },
          { name: "Dad", score: 0 },
        ],
        lastActual: { down: 100, up: 20 },
      }),
    ).toBe(fallback);
  });

  it("includes the URL exactly once in full text and separately in the share payload", () => {
    const input = {
      players: [{ name: "Ada", score: 3 }],
      lastActual: { down: 100, up: 20 },
    };
    const fullText = buildShareText(input);
    const payload = buildSharePayload(input);
    expect(fullText.split(SHARE_URL)).toHaveLength(2);
    expect(payload.url).toBe(SHARE_URL);
    expect(payload.text).not.toContain(SHARE_URL);
    expect(`${payload.text} ${payload.url}`).toBe(fullText);
  });

  it("does not use an em dash in share text", () => {
    expect(
      buildShareText({
        players: [
          { name: "One", score: 4 },
          { name: "Two", score: 2 },
        ],
        lastActual: { down: 42, up: 8 },
      }),
    ).not.toContain("\u2014");
  });
});
