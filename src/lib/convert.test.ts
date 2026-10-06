import { describe, expect, it } from "vitest";
import {
  downloadSeconds,
  formatDuration,
  mbpsFromMBps,
  mbpsToMBps,
} from "./convert";

describe("Mbps and MB/s conversion", () => {
  it("converts decimal speeds in both directions", () => {
    expect(mbpsToMBps(100)).toBe(12.5);
    expect(mbpsToMBps(12.8)).toBeCloseTo(1.6);
    expect(mbpsFromMBps(12.5)).toBe(100);
    expect(mbpsFromMBps(1.25)).toBe(10);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "returns null for invalid Mbps input %s",
    (input) => {
      expect(mbpsToMBps(input)).toBeNull();
      expect(mbpsFromMBps(input)).toBeNull();
    },
  );
});

describe("downloadSeconds", () => {
  it("estimates decimal file transfer time with optional efficiency", () => {
    expect(downloadSeconds(5_000_000_000, 100)).toBe(400);
    expect(downloadSeconds(5_000_000_000, 100, 0.9)).toBeCloseTo(400 / 0.9);
    expect(downloadSeconds(2_500_000, 50)).toBe(0.4);
  });

  it.each([
    [0, 100, 1],
    [-1, 100, 1],
    [Number.NaN, 100, 1],
    [1_000_000, 0, 1],
    [1_000_000, -1, 1],
    [1_000_000, Number.NaN, 1],
    [1_000_000, 100, 0],
    [1_000_000, 100, -0.5],
    [1_000_000, 100, Number.NaN],
  ])(
    "returns null for invalid size, speed, or efficiency %s",
    (size, speed, efficiency) => {
      expect(downloadSeconds(size, speed, efficiency)).toBeNull();
    },
  );
});

describe("formatDuration", () => {
  it.each([
    [1, "1 s"],
    [59, "59 s"],
    [60, "1 min"],
    [61, "1 min 1 s"],
    [3599, "59 min 59 s"],
    [3600, "1 hr"],
    [3661, "1 hr 1 min 1 s"],
    [7200, "2 hr"],
    [400, "6 min 40 s"],
  ])("formats %s seconds as %s", (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "returns null for invalid duration %s",
    (seconds) => {
      expect(formatDuration(seconds)).toBeNull();
    },
  );
});
