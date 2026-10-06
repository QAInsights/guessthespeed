import { describe, expect, it } from "vitest";
import {
  addStatEvent,
  EMPTY_TOTALS,
  formatPlayStat,
  normalizeTotals,
  parseStatEvent,
  roundStatEvent,
  type PlayTotals,
} from "./stats";
import type { PlayerRoundScore } from "./scoring";

function totals(
  overrides: Partial<Omit<PlayTotals, "modes">> & {
    modes?: Partial<PlayTotals["modes"]>;
  } = {},
): PlayTotals {
  return {
    ...EMPTY_TOTALS,
    ...overrides,
    modes: { ...EMPTY_TOTALS.modes, ...overrides.modes },
  };
}

function score(overrides: Partial<PlayerRoundScore> = {}): PlayerRoundScore {
  return {
    id: "player",
    downMiss: null,
    upMiss: null,
    miss: null,
    place: null,
    placePoints: 0,
    bonus: 0,
    total: 0,
    ...overrides,
  };
}

describe("parseStatEvent", () => {
  it("accepts old-shape round events and ignores extra keys", () => {
    expect(parseStatEvent({ kind: "round", guesses: 1, extra: true })).toEqual({
      kind: "round",
      guesses: 1,
    });
    expect(parseStatEvent({ kind: "round", guesses: 12 })).toEqual({
      kind: "round",
      guesses: 12,
    });
  });

  it("accepts and rounds the optional aggregate fields", () => {
    expect(
      parseStatEvent({
        kind: "round",
        guesses: 3,
        mode: "room",
        down: 267.46,
        closestMiss: 3.17,
        spotOns: 2,
      }),
    ).toEqual({
      kind: "round",
      guesses: 3,
      mode: "room",
      down: 267.5,
      closestMiss: 3.2,
      spotOns: 2,
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
    { kind: "round", guesses: 3, mode: "x" },
    { kind: "round", guesses: 3, down: 0 },
    { kind: "round", guesses: 3, down: -1 },
    { kind: "round", guesses: 3, down: 20000 },
    { kind: "round", guesses: 3, down: Number.NaN },
    { kind: "round", guesses: 3, closestMiss: 101 },
    { kind: "round", guesses: 3, spotOns: 4 },
    { kind: "round", guesses: 3, spotOns: 1.5 },
    { kind: "other", guesses: 3 },
    {},
    null,
    [],
  ])("rejects invalid event %j", (event) => {
    expect(parseStatEvent(event)).toBeNull();
  });
});

describe("normalizeTotals", () => {
  it("fills the new fields when given the old stored shape", () => {
    expect(normalizeTotals({ rounds: 7, games: 2, guesses: 20 })).toEqual({
      rounds: 7,
      games: 2,
      guesses: 20,
      spotOns: 0,
      fastestDown: 0,
      closestMissSum: 0,
      closestMissRounds: 0,
      modes: { local: 0, room: 0, classroom: 0 },
    });
  });

  it("returns zero totals for garbage and replaces invalid fields", () => {
    expect(normalizeTotals(null)).toEqual(EMPTY_TOTALS);
    expect(
      normalizeTotals({
        rounds: -1,
        games: "two",
        guesses: 2,
        spotOns: 3,
        fastestDown: Infinity,
        closestMissSum: -1,
        closestMissRounds: 1.5,
        modes: { local: "one", room: 1, classroom: -1 },
      }),
    ).toEqual(
      totals({
        guesses: 2,
        modes: { room: 1 },
      }),
    );
  });
});

describe("addStatEvent", () => {
  it("adds aggregate values and keeps the fastest and rounded miss sum", () => {
    const afterFirst = addStatEvent(EMPTY_TOTALS, {
      kind: "round",
      guesses: 2,
      mode: "room",
      down: 345.6,
      closestMiss: 1.1,
      spotOns: 1,
    });
    const afterSecond = addStatEvent(afterFirst, {
      kind: "round",
      guesses: 1,
      mode: "classroom",
      down: 275.3,
      closestMiss: 2.2,
      spotOns: 0,
    });
    const afterGame = addStatEvent(afterSecond, { kind: "game" });

    expect(afterSecond).toEqual(
      totals({
        rounds: 2,
        guesses: 3,
        spotOns: 1,
        fastestDown: 345.6,
        closestMissSum: 3.3,
        closestMissRounds: 2,
        modes: { room: 1, classroom: 1 },
      }),
    );
    expect(afterGame.games).toBe(1);
    expect(EMPTY_TOTALS).toEqual(totals());
  });

  it("does not split legacy rounds that have no mode", () => {
    expect(
      addStatEvent(EMPTY_TOTALS, { kind: "round", guesses: 1 }).modes,
    ).toEqual({ local: 0, room: 0, classroom: 0 });
  });
});

describe("roundStatEvent", () => {
  it("picks the best miss, clamps download and counts spot-on players", () => {
    expect(
      roundStatEvent(
        [
          score({ id: "one", miss: 0.041, bonus: 1 }),
          score({ id: "two", miss: 0.027, bonus: 0 }),
          score({ id: "three", miss: null, bonus: 2 }),
          score({ id: "four", miss: 0.018, bonus: 1 }),
        ],
        { down: 10123.45, up: 30 },
        "local",
        2,
      ),
    ).toEqual({
      kind: "round",
      guesses: 2,
      mode: "local",
      down: 10000,
      closestMiss: 1.8,
      spotOns: 2,
    });
  });

  it("clamps a best miss above 100 percent", () => {
    expect(
      roundStatEvent([score({ miss: 1.8 })], { down: 25, up: 10 }, "room", 1),
    ).toMatchObject({ mode: "room", closestMiss: 100 });
  });

  it("omits closest miss when all player misses are null", () => {
    const event = roundStatEvent(
      [score({ miss: null })],
      { down: 25, up: 10 },
      "classroom",
      1,
    );
    expect(event).not.toHaveProperty("closestMiss");
  });
});

describe("formatPlayStat", () => {
  it("hides totals below the display threshold", () => {
    expect(formatPlayStat(totals({ rounds: 49, games: 10, guesses: 90 }))).toBe(
      null,
    );
    expect(formatPlayStat(null)).toBeNull();
  });

  it("formats long and short totals at and above the threshold", () => {
    expect(formatPlayStat(totals({ rounds: 50, games: 10, guesses: 90 }))).toBe(
      "50 rounds played so far",
    );
    expect(
      formatPlayStat(totals({ rounds: 12345, games: 20, guesses: 150 })),
    ).toBe("12,345 rounds played so far");
    expect(
      formatPlayStat(totals({ rounds: 12345, games: 20, guesses: 150 }), {
        short: true,
      }),
    ).toBe("12,345 rounds so far");
  });
});
