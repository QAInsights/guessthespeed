import { describe, expect, it } from "vitest";
import { REVEAL_SWING_MS, revealProgress } from "./gauge-reveal";

describe("revealProgress", () => {
  it("starts at zero", () => {
    expect(revealProgress(0, 0.7)).toBe(0);
  });

  it("swings past a target above 0.5 during the first 600 ms", () => {
    const samples = Array.from({ length: 61 }, (_, index) =>
      revealProgress(index * 10, 0.5),
    );

    expect(samples.some((progress) => progress > 0.5)).toBe(true);
  });

  it("stays within the gauge range for a full swing", () => {
    for (let elapsedMs = 0; elapsedMs <= REVEAL_SWING_MS; elapsedMs += 10) {
      const progress = revealProgress(elapsedMs, 1);
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThanOrEqual(1.03);
    }
  });

  it("settles exactly on the target at and after the swing duration", () => {
    expect(revealProgress(REVEAL_SWING_MS, 0.72)).toBe(0.72);
    expect(revealProgress(REVEAL_SWING_MS + 500, 0.72)).toBe(0.72);
  });

  it("stays at zero for a zero target", () => {
    for (const elapsedMs of [-100, 0, 200, REVEAL_SWING_MS, 4000]) {
      expect(revealProgress(elapsedMs, 0)).toBe(0);
    }
  });
});
