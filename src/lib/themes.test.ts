import { describe, expect, it } from "vitest";
import { themeForDate } from "./themes";

describe("themeForDate", () => {
  it("uses the fourth Thursday of November for Thanksgiving", () => {
    expect(themeForDate(new Date(2026, 10, 26))).toBe("thanksgiving");
  });

  it("uses the Western Easter date and its theme window", () => {
    expect(themeForDate(new Date(2026, 3, 5))).toBe("easter");
  });

  it("gives Diwali priority over Halloween, then resumes Halloween afterward", () => {
    expect(themeForDate(new Date(2028, 9, 17))).toBe("diwali");
    expect(themeForDate(new Date(2028, 9, 20))).toBe("halloween");
  });

  it("keeps the New Year window across the year boundary", () => {
    expect(themeForDate(new Date(2026, 11, 31))).toBe("newyear");
    expect(themeForDate(new Date(2027, 0, 1))).toBe("newyear");
  });

  it("gives Pongal priority over winter", () => {
    expect(themeForDate(new Date(2027, 0, 14))).toBe("pongal");
  });

  it("returns no festival for a plain day", () => {
    expect(themeForDate(new Date(2026, 5, 10))).toBeNull();
  });
});
