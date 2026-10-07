import { describe, expect, it } from "vitest";
import {
  addSample,
  compareLatest,
  HISTORY_KEY,
  HISTORY_MAX,
  parseHistory,
  type SpeedSample,
} from "./history";

const sample = (at: number, down: number): SpeedSample => ({
  at,
  down,
  up: 20,
  ping: 12,
});

describe("parseHistory", () => {
  it("exports the storage key and ten-sample limit", () => {
    expect(HISTORY_KEY).toBe("gts:speed-history");
    expect(HISTORY_MAX).toBe(10);
  });

  it("keeps valid entries in chronological order", () => {
    expect(
      parseHistory([sample(3, 300), sample(1, 100), sample(2, 200)]),
    ).toEqual([sample(1, 100), sample(2, 200), sample(3, 300)]);
  });

  it("drops invalid entries", () => {
    expect(
      parseHistory([
        sample(1, 100),
        { at: Number.NaN, down: 100, up: 20, ping: 12 },
        { at: 2, down: Number.POSITIVE_INFINITY, up: 20, ping: 12 },
        { at: 2, down: 100, up: Number.POSITIVE_INFINITY, ping: 12 },
        { at: 2, down: 100, up: 20, ping: Number.NaN },
        { at: 3, down: 100, up: 0, ping: 12 },
        { at: 4, down: 100, up: 20, ping: -1 },
        { at: 5, down: -1, up: 20, ping: 12 },
        { at: 0, down: 100, up: 20, ping: 12 },
        { at: Number.MAX_VALUE, down: 100, up: 20, ping: 12 },
        null,
      ]),
    ).toEqual([sample(1, 100)]);
  });

  it("parses stored JSON and handles malformed input", () => {
    expect(parseHistory(JSON.stringify([sample(1, 100)]))).toEqual([
      sample(1, 100),
    ]);
    expect(parseHistory("{")).toEqual([]);
    expect(parseHistory(null)).toEqual([]);
  });

  it("keeps only the latest ten samples", () => {
    const parsed = parseHistory(
      Array.from({ length: HISTORY_MAX + 3 }, (_, index) =>
        sample(index + 1, index + 100),
      ),
    );
    expect(parsed).toHaveLength(HISTORY_MAX);
    expect(parsed[0].at).toBe(4);
    expect(parsed.at(-1)?.at).toBe(13);
  });
});

describe("addSample", () => {
  it("appends a sample and caps the list at ten", () => {
    const initial = Array.from({ length: HISTORY_MAX }, (_, index) =>
      sample(index + 1, index + 100),
    );
    const next = addSample(initial, sample(11, 200));
    expect(next).toHaveLength(HISTORY_MAX);
    expect(next[0].at).toBe(2);
    expect(next.at(-1)).toEqual(sample(11, 200));
    expect(initial[0].at).toBe(1);
  });
});

describe("compareLatest", () => {
  it("returns null with fewer than two samples", () => {
    expect(compareLatest([])).toBeNull();
    expect(compareLatest([sample(1, 100)])).toBeNull();
  });

  it("reports rounded improvements and declines", () => {
    expect(compareLatest([sample(1, 100), sample(2, 141.4)])).toEqual({
      delta: 41,
      direction: "faster",
    });
    expect(compareLatest([sample(1, 100), sample(2, 88.2)])).toEqual({
      delta: -12,
      direction: "slower",
    });
  });

  it("reports the same speed when the rounded delta is zero", () => {
    expect(compareLatest([sample(1, 100.2), sample(2, 100.1)])).toEqual({
      delta: 0,
      direction: "same",
    });
  });
});
