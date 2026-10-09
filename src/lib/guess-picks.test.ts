import { describe, expect, it } from "vitest";
import { GUESS_PICKS, stepGuess } from "./guess-picks";

describe("guess picks", () => {
  it("provides the requested download and upload values", () => {
    expect(GUESS_PICKS.down.map(({ value }) => value)).toEqual([
      25, 100, 300, 1000,
    ]);
    expect(GUESS_PICKS.up.map(({ value }) => value)).toEqual([5, 20, 100, 500]);
  });
});

describe("stepGuess", () => {
  it.each([
    ["empty input", "", 1, 5],
    ["zero", 0, 1, 5],
    ["49 boundary", 49, 1, 54],
    ["50 boundary", 50, 1, 60],
    ["199 boundary", 199, 1, 209],
    ["200 boundary", 200, 1, 250],
    ["999 boundary", 999, 1, 1049],
    ["1000 boundary", 1000, 1, 1100],
    ["floor at zero", 0, -1, 0],
    ["floor below zero", -5, -1, 0],
  ] as const)(
    "uses the correct increment for %s",
    (_label, value, direction, result) => {
      expect(stepGuess(value, direction)).toBe(result);
    },
  );
});
