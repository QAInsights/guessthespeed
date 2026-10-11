import { describe, expect, it } from "vitest";
import {
  canEndGame,
  finishRaceLanes,
  focusLayout,
  liveRaceLanes,
  observeRaceLocks,
  raceMultiplier,
} from "./focus";
import type { PlayerRoundScore } from "./scoring";

const base = {
  dev: false,
  devStarted: false,
  race: false,
  phase: "guessing",
  testing: false,
  played: false,
};

const score = (
  id: string,
  timingBonus: number | undefined,
  total: number,
): PlayerRoundScore => ({
  id,
  downMiss: 0.1,
  upMiss: 0.1,
  miss: timingBonus === undefined ? null : 0.1,
  place: 1,
  placePoints: 3,
  bonus: 0,
  total,
  basePoints: timingBonus === undefined ? 0 : 3,
  timingBonus,
});

describe("focusLayout", () => {
  it("stays off in the lobby and on the champion screen", () => {
    expect(focusLayout(base)).toBeNull();
    expect(focusLayout({ ...base, phase: "champion" })).toBeNull();
  });

  it("starts when the test starts and keeps the results in focus", () => {
    expect(focusLayout({ ...base, testing: true })).toEqual({
      layout: "game",
      stage: "live",
    });
    expect(focusLayout({ ...base, race: true, phase: "results" })).toEqual({
      layout: "race",
      stage: "result",
    });
  });

  it("stays focused between rounds once a round has been played", () => {
    expect(focusLayout({ ...base, played: true })).toEqual({
      layout: "game",
      stage: "lobby",
    });
    expect(focusLayout({ ...base, race: true, played: true })).toEqual({
      layout: "game",
      stage: "lobby",
    });
    expect(
      focusLayout({ ...base, race: true, played: true, testing: true }),
    ).toEqual({ layout: "race", stage: "live" });
    expect(
      focusLayout({ ...base, phase: "champion", played: true }),
    ).toBeNull();
  });

  it("treats the reveal animation as live", () => {
    expect(
      focusLayout({ ...base, phase: "results", testing: true }),
    ).toMatchObject({ stage: "live" });
  });

  it("focuses Dev mode from its first Start, through the result", () => {
    expect(focusLayout({ ...base, dev: true })).toBeNull();
    expect(
      focusLayout({ ...base, dev: true, phase: "results", race: true }),
    ).toBeNull();
    expect(
      focusLayout({ ...base, dev: true, devStarted: true, testing: true }),
    ).toEqual({ layout: "dev", stage: "live" });
    expect(focusLayout({ ...base, dev: true, devStarted: true })).toEqual({
      layout: "dev",
      stage: "result",
    });
  });
});

describe("race lanes", () => {
  it("maps track position to the timing multiplier", () => {
    expect(raceMultiplier(0)).toBe(0.5);
    expect(raceMultiplier(0.5)).toBe(0.75);
    expect(raceMultiplier(2)).toBe(1);
  });

  it("keeps locked players at their lock spot and moves thinkers with the race", () => {
    const lanes = liveRaceLanes(
      [
        { id: "a", locked: true },
        { id: "b", locked: false },
      ],
      new Map([["a", 0.2]]),
      0.6,
    );
    expect(lanes[0]).toMatchObject({ state: "locked", position: 0.2 });
    expect(lanes[0].multiplier).toBeCloseTo(0.6);
    expect(lanes[1]).toMatchObject({ state: "thinking", position: 0.6 });
    expect(lanes[1].multiplier).toBeCloseTo(0.8);
  });

  it("places finish lanes from the server timing bonus", () => {
    const lanes = finishRaceLanes(
      [{ id: "a" }, { id: "b" }, { id: "gone" }],
      [score("a", 0.9, 27), score("b", undefined, 0)],
      new Set(["a"]),
    );
    expect(lanes).toHaveLength(2);
    expect(lanes[0]).toMatchObject({ state: "finished", winner: true });
    expect(lanes[0].position).toBeCloseTo(0.8);
    expect(lanes[1]).toMatchObject({ state: "no-guess", multiplier: null });
  });

  it("remembers when other players locked", () => {
    const first = observeRaceLocks(
      new Map(),
      [
        { id: "early", locked: true },
        { id: "late", locked: false },
      ],
      0,
      true,
    );
    expect(first.get("early")).toBe(0);
    const second = observeRaceLocks(
      first,
      [
        { id: "early", locked: true },
        { id: "late", locked: true },
      ],
      0.45,
      false,
    );
    expect(second.get("early")).toBe(0);
    expect(second.get("late")).toBe(0.45);
    const third = observeRaceLocks(
      second,
      [
        { id: "early", locked: false },
        { id: "late", locked: true },
      ],
      0.7,
      false,
    );
    expect(third.has("early")).toBe(false);
    expect(third.get("late")).toBe(0.45);
  });
});

describe("canEndGame", () => {
  it("offers End game on results and between rounds", () => {
    expect(canEndGame({ layout: "game", stage: "result" }, true)).toBe(true);
    expect(canEndGame({ layout: "race", stage: "result" }, true)).toBe(true);
    expect(canEndGame({ layout: "game", stage: "lobby" }, true)).toBe(true);
  });

  it("hides End game during a test, outside a game, in Dev and for guests", () => {
    expect(canEndGame({ layout: "race", stage: "live" }, true)).toBe(false);
    expect(canEndGame(null, true)).toBe(false);
    expect(canEndGame({ layout: "dev", stage: "result" }, true)).toBe(false);
    expect(canEndGame({ layout: "game", stage: "result" }, false)).toBe(false);
  });
});
