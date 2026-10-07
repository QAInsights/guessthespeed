import { describe, expect, it } from "vitest";
import { themeForDate } from "./themes";

const movableCenters = [
  {
    theme: "eidfitr",
    dates: [
      "2026-03-20",
      "2027-03-09",
      "2028-02-26",
      "2029-02-14",
      "2030-02-04",
    ],
  },
  {
    theme: "eidadha",
    dates: [
      "2026-05-27",
      "2027-05-16",
      "2028-05-05",
      "2029-04-24",
      "2030-04-13",
    ],
  },
  {
    theme: "lunarnewyear",
    dates: [
      "2026-02-17",
      "2027-02-06",
      "2028-01-26",
      "2029-02-13",
      "2030-02-03",
    ],
  },
] as const;

const localDate = (date: string) => new Date(`${date}T12:00:00`);

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

  for (const { theme, dates } of movableCenters) {
    it.each(dates)(`uses ${theme} on its lookup date %s`, (date) => {
      expect(themeForDate(localDate(date))).toBe(theme);
    });
  }

  it("uses St. Patrick’s Day from March 15 to 17", () => {
    expect(themeForDate(new Date(2026, 2, 17))).toBe("stpatricks");
  });

  it("lets movable festivals beat fixed theme windows", () => {
    expect(themeForDate(localDate("2028-01-26"))).toBe("lunarnewyear");
  });

  it("chooses the closest festival centre when movable windows overlap", () => {
    expect(themeForDate(localDate("2029-02-12"))).toBe("lunarnewyear");
    expect(themeForDate(localDate("2029-02-13"))).toBe("lunarnewyear");
    expect(themeForDate(localDate("2029-02-14"))).toBe("eidfitr");
    expect(themeForDate(localDate("2030-02-02"))).toBe("lunarnewyear");
    expect(themeForDate(localDate("2030-02-04"))).toBe("eidfitr");
    expect(themeForDate(localDate("2030-02-07"))).toBe("lunarnewyear");
    expect(themeForDate(localDate("2030-04-15"))).toBe("eidadha");
  });

  it("uses the stated festival order to break a distance tie", () => {
    expect(themeForDate(localDate("2030-04-17"))).toBe("easter");
  });

  it("keeps Holi’s existing lookup date", () => {
    expect(themeForDate(localDate("2027-03-22"))).toBe("holi");
  });

  it("returns no festival for a plain day", () => {
    expect(themeForDate(new Date(2026, 5, 10))).toBeNull();
  });
});
