import { describe, expect, it } from "vitest";
import { ACTIVITY_RATES, recommendSpeed, type ActivityId } from "./speed-needs";

const emptyCounts = (): Record<ActivityId, number> => ({
  streams4k: 0,
  streamsHd: 0,
  callsHd: 0,
  onlineGamers: 0,
  largeDownloads: 0,
  smartHomeDevices: 0,
});

describe("recommendSpeed", () => {
  it("returns a sensible minimum when no activities are selected", () => {
    expect(recommendSpeed(emptyCounts())).toEqual({
      down: 25,
      up: 5,
      tierDown: 25,
      tierUp: 25,
    });
  });

  it("adds 25 percent headroom before rounding up to a common tier", () => {
    const counts = emptyCounts();
    counts.streams4k = 2;
    counts.callsHd = 3;

    expect(recommendSpeed(counts)).toEqual({
      down: 64.3,
      up: 11.3,
      tierDown: 100,
      tierUp: 25,
    });
  });

  it("rounds each direction independently to the next plan tier", () => {
    const counts = emptyCounts();
    counts.streamsHd = 5;
    counts.callsHd = 2;

    expect(recommendSpeed(counts)).toEqual({
      down: 40.8,
      up: 7.5,
      tierDown: 50,
      tierUp: 25,
    });
  });

  it("clamps counts to whole values between zero and twelve", () => {
    const counts = emptyCounts();
    counts.streams4k = 99;
    counts.callsHd = -4;
    counts.onlineGamers = 2.9;

    expect(recommendSpeed(counts)).toEqual({
      down: 337.5,
      up: 37.5,
      tierDown: 500,
      tierUp: 50,
    });
  });

  it("treats non-finite counts as zero", () => {
    const counts = emptyCounts();
    counts.callsHd = Number.NaN;
    counts.smartHomeDevices = Number.POSITIVE_INFINITY;

    expect(recommendSpeed(counts)).toEqual({
      down: 25,
      up: 5,
      tierDown: 25,
      tierUp: 25,
    });
  });

  it("keeps published activity rates linked to their official sources", () => {
    for (const rate of Object.values(ACTIVITY_RATES)) {
      expect(rate.source).toMatch(/^https:\/\//);
      expect(rate.label.length).toBeGreaterThan(0);
    }
  });
});
