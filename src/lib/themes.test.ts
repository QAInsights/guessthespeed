import { describe, expect, it } from "vitest";
import { themeForDate } from "./themes";

const movableCenters = [
  {
    theme: "diwali",
    dates: [
      "2026-11-08",
      "2027-10-29",
      "2028-10-17",
      "2029-11-05",
      "2030-10-26",
      "2031-11-14",
      "2032-11-02",
      "2033-10-22",
      "2034-11-10",
      "2035-10-30",
      "2036-10-18",
      "2037-11-07",
      "2038-10-27",
      "2039-11-15",
      "2040-11-04",
    ],
  },
  {
    theme: "holi",
    dates: [
      "2026-03-04",
      "2027-03-22",
      "2028-03-11",
      "2029-03-01",
      "2030-03-20",
      "2031-03-09",
      "2032-03-27",
      "2033-03-16",
      "2034-03-05",
      "2035-03-24",
      "2036-03-12",
      "2037-03-02",
      "2038-03-21",
      "2039-03-11",
      "2040-03-29",
    ],
  },
  {
    theme: "eidfitr",
    dates: [
      "2026-03-20",
      "2027-03-09",
      "2028-02-26",
      "2029-02-14",
      "2030-02-04",
      "2031-01-24",
      "2032-01-14",
      "2033-01-02",
      "2033-12-23",
      "2034-12-12",
      "2035-12-01",
      "2036-11-19",
      "2037-11-08",
      "2038-10-29",
      "2039-10-19",
      "2040-10-07",
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
      "2031-04-02",
      "2032-03-22",
      "2033-03-11",
      "2034-03-01",
      "2035-02-18",
      "2036-02-07",
      "2037-01-26",
      "2038-01-16",
      "2039-01-05",
      "2039-12-26",
      "2040-12-14",
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
      "2031-01-23",
      "2032-02-11",
      "2033-01-31",
      "2034-02-19",
      "2035-02-08",
      "2036-01-28",
      "2037-02-15",
      "2038-02-04",
      "2039-01-24",
      "2040-02-12",
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

  it("matches both 2033 Eid al-Fitr dates and the window across New Year", () => {
    expect(themeForDate(localDate("2033-01-02"))).toBe("eidfitr");
    expect(themeForDate(localDate("2033-12-23"))).toBe("eidfitr");
    expect(themeForDate(localDate("2033-12-24"))).toBe("eidfitr");
    expect(themeForDate(localDate("2033-12-25"))).toBe("eidfitr");
  });

  it("uses normal fixed-date themes after the lookup data ends", () => {
    expect(themeForDate(localDate("2041-01-01"))).toBe("newyear");
  });

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
