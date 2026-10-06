import { describe, expect, it } from "vitest";
import {
  addStatEvent,
  EMPTY_TOTALS,
  formatPlayStat,
  parseStatEvent,
} from "./stats";

describe("parseStatEvent", () => {
  it("accepts valid round and game events and ignores extra keys", () => {
    expect(parseStatEvent({ kind: "round", guesses: 1, extra: true })).toEqual({
      kind: "round",
      guesses: 1,
    });
    expect(parseStatEvent({ kind: "round", guesses: 12 })).toEqual({
      kind: "round",
      guesses: 12,
    });
    expect(parseStatEvent({ kind: "game", extra: true })).toEqual({
      kind: "game",
    });
  });

  it.each([
    { kind: "round", guesses: 0 },
    { kind: "round", guesses: 13 },
    { kind: "round", guesses: 2.5 },
    { kind: "round", guesses: "3" },
    { kind: "round" },
    { kind: "other", guesses: 3 },
    {},
    null,
    [],
  ])("rejects invalid event %j", (event) => {
    expect(parseStatEvent(event)).toBeNull();
  });
});

describe("addStatEvent", () => {
  it("adds rounds, games, and locked guesses to new totals", () => {
    const afterRound = addStatEvent(EMPTY_TOTALS, {
      kind: "round",
      guesses: 3,
    });
    const afterGame = addStatEvent(afterRound, { kind: "game" });

    expect(afterRound).toEqual({ rounds: 1, games: 0, guesses: 3 });
    expect(afterGame).toEqual({ rounds: 1, games: 1, guesses: 3 });
    expect(EMPTY_TOTALS).toEqual({ rounds: 0, games: 0, guesses: 0 });
  });
});

describe("formatPlayStat", () => {
  it("hides totals below the display threshold", () => {
    expect(formatPlayStat({ rounds: 49, games: 10, guesses: 90 })).toBeNull();
    expect(formatPlayStat(null)).toBeNull();
  });

  it("formats long and short totals at and above the threshold", () => {
    expect(formatPlayStat({ rounds: 50, games: 10, guesses: 90 })).toBe(
      "50 rounds played so far",
    );
    expect(formatPlayStat({ rounds: 12345, games: 20, guesses: 150 })).toBe(
      "12,345 rounds played so far",
    );
    expect(
      formatPlayStat(
        { rounds: 12345, games: 20, guesses: 150 },
        { short: true },
      ),
    ).toBe("12,345 rounds so far");
  });

  it("formats the round count using the requested locale", () => {
    expect(
      formatPlayStat({ rounds: 12345, games: 20, guesses: 150 }, {}, "de"),
    ).toBe("12.345 rounds played so far");
  });
});
