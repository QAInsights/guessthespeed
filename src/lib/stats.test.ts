import { describe, expect, it } from "vitest";
import {
  addStatEvent,
  EMPTY_TOTALS,
  normalizeTotals,
  parseStatEvent,
  playStatRounds,
  roomStatMode,
  roundStatEvent,
  STAT_DOWN_CAP,
  type PlayTotals,
} from "./stats";
import type { PlayerRoundScore } from "./scoring";
import { createRoom } from "./room";

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

  it("accepts Dev events and Work round modes", () => {
    expect(parseStatEvent({ kind: "dev" })).toEqual({ kind: "dev" });
    expect(parseStatEvent({ kind: "dev", extra: true })).toBeNull();
    expect(parseStatEvent({ kind: "round", guesses: 2, mode: "work" })).toEqual(
      { kind: "round", guesses: 2, mode: "work" },
    );
    expect(
      parseStatEvent({ kind: "round", guesses: 2, mode: "bogus" }),
    ).toBeNull();
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
  it("fills the new fields when given legacy stored shapes", () => {
    const oldShape = normalizeTotals({
      rounds: 7,
      games: 2,
      guesses: 20,
    });
    expect(oldShape).toEqual({
      rounds: 7,
      games: 2,
      devRuns: 0,
      guesses: 20,
      spotOns: 0,
      downSum: 0,
      downRounds: 0,
      closestMissSum: 0,
      closestMissRounds: 0,
      modes: { local: 0, room: 0, classroom: 0, work: 0 },
    });
    expect(oldShape).not.toHaveProperty("fastestDown");

    const fastestLegacy = normalizeTotals({
      rounds: 7,
      games: 2,
      guesses: 20,
      fastestDown: 900,
    });
    expect(fastestLegacy.downSum).toBe(0);
    expect(fastestLegacy.downRounds).toBe(0);
    expect(fastestLegacy).not.toHaveProperty("fastestDown");
  });

  it("returns zero totals for garbage and replaces invalid fields", () => {
    expect(normalizeTotals(null)).toEqual(EMPTY_TOTALS);
    expect(
      normalizeTotals({
        rounds: -1,
        games: "two",
        devRuns: "many",
        guesses: 2,
        spotOns: 3,
        downSum: Infinity,
        downRounds: 1.5,
        closestMissSum: -1,
        closestMissRounds: 1.5,
        modes: { local: "one", room: 1, classroom: -1, work: 1.5 },
      }),
    ).toEqual(
      totals({
        guesses: 2,
        devRuns: 0,
        modes: { room: 1 },
      }),
    );
  });
});

describe("addStatEvent", () => {
  it("increments only the Dev run total for a Dev event", () => {
    const before = totals({
      rounds: 5,
      games: 2,
      guesses: 10,
      modes: { room: 2, work: 3 },
    });

    expect(addStatEvent(before, { kind: "dev" })).toEqual({
      ...before,
      devRuns: 1,
    });
  });

  it("adds download and closest-miss aggregates", () => {
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
        downSum: 620.9,
        downRounds: 2,
        closestMissSum: 3.3,
        closestMissRounds: 2,
        modes: { room: 1, classroom: 1 },
      }),
    );
    expect(afterGame.games).toBe(1);
    expect(EMPTY_TOTALS).toEqual(totals());
  });

  it("caps a round's download contribution", () => {
    const afterRound = addStatEvent(EMPTY_TOTALS, {
      kind: "round",
      guesses: 1,
      down: 10000,
    });

    expect(afterRound.downSum).toBe(STAT_DOWN_CAP);
    expect(afterRound.downRounds).toBe(1);
  });

  it("leaves download aggregates unchanged when a round has no download", () => {
    const before = totals({ downSum: 345.6, downRounds: 2 });
    const after = addStatEvent(before, { kind: "round", guesses: 1 });

    expect(after.downSum).toBe(345.6);
    expect(after.downRounds).toBe(2);
  });

  it("does not split legacy rounds that have no mode", () => {
    expect(
      addStatEvent(EMPTY_TOTALS, { kind: "round", guesses: 1 }).modes,
    ).toEqual({ local: 0, room: 0, classroom: 0, work: 0 });
  });

  it("counts Work rounds in the Work mode bucket", () => {
    const after = addStatEvent(EMPTY_TOTALS, {
      kind: "round",
      guesses: 2,
      mode: "work",
    });

    expect(after.rounds).toBe(1);
    expect(after.modes.work).toBe(1);
  });
});

describe("roomStatMode", () => {
  it("distinguishes team rooms from other rooms", () => {
    expect(roomStatMode("team")).toBe("work");
    expect(roomStatMode("family")).toBe("room");
    expect(roomStatMode(undefined)).toBe("room");
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

  it("keeps team-room rounds in the Work stats bucket", () => {
    const teamRoom = createRoom("BCDFGH", "token", 0, "team");
    expect(teamRoom.kind).toBe("team");
    expect(
      roundStatEvent(
        [score({ miss: 0.1 })],
        { down: 100, up: 20 },
        roomStatMode(teamRoom.kind),
        1,
      ),
    ).toMatchObject({ kind: "round", mode: "work" });
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

describe("playStatRounds", () => {
  it("hides zero-round totals", () => {
    expect(playStatRounds(totals())).toBeNull();
    expect(playStatRounds(null)).toBeNull();
  });

  it("returns the number of rounds to format in the active locale", () => {
    expect(playStatRounds(totals({ rounds: 1, games: 1, guesses: 2 }))).toBe(1);
    expect(
      playStatRounds(totals({ rounds: 1234, games: 20, guesses: 150 })),
    ).toBe(1234);
  });
});
