import { describe, expect, it } from "vitest";
import { auroraFor, auroraStyleVars } from "./aurora";

describe("aurora styles", () => {
  it("returns the same style for the same seed", () => {
    expect(auroraFor("player-1")).toEqual(auroraFor("player-1"));
  });

  it("keeps all style values in range", () => {
    for (let index = 0; index < 50; index += 1) {
      const style = auroraFor(`player-${index}`);
      expect(style.colors.length).toBeGreaterThanOrEqual(2);
      expect(style.colors.length).toBeLessThanOrEqual(3);
      expect(style.colors.every((color) => color >= 1 && color <= 5)).toBe(
        true,
      );
      expect(style.durationS).toBeGreaterThanOrEqual(12);
      expect(style.durationS).toBeLessThanOrEqual(18);
      expect(Number.isInteger(style.angleDeg)).toBe(true);
      expect(style.angleDeg).toBeGreaterThanOrEqual(0);
      expect(style.angleDeg).toBeLessThan(360);
      expect(style.delayS).toBeGreaterThan(-style.durationS);
      expect(style.delayS).toBeLessThanOrEqual(0);
      expect(Math.round(style.durationS * 10)).toBe(style.durationS * 10);
      expect(Math.round(style.delayS * 10)).toBe(style.delayS * 10);
    }
  });

  it("uses distinct palette indices", () => {
    for (let index = 0; index < 50; index += 1) {
      const { colors } = auroraFor(`player-${index}`);
      expect(new Set(colors).size).toBe(colors.length);
    }
  });

  it("produces both two- and three-colour styles", () => {
    const colorCounts = new Set(
      Array.from(
        { length: 50 },
        (_, index) => auroraFor(`player-${index}`).colors.length,
      ),
    );
    expect(colorCounts).toEqual(new Set([2, 3]));
  });

  it("varies durations and angles across seeds", () => {
    const styles = Array.from({ length: 12 }, (_, index) =>
      auroraFor(`player-${index}`),
    );
    expect(
      new Set(styles.map((style) => style.durationS)).size,
    ).toBeGreaterThan(1);
    expect(new Set(styles.map((style) => style.angleDeg)).size).toBeGreaterThan(
      1,
    );
  });

  it("formats CSS variables deterministically", () => {
    expect(auroraStyleVars(auroraFor("fixed-seed"))).toBe(
      "--aurora-a:var(--aurora-3);--aurora-b:var(--aurora-1);--aurora-c:var(--aurora-4);--aurora-dur:16.0s;--aurora-start:3deg;--aurora-delay:-10.6s",
    );
  });
});
