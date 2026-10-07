export type ThemeId =
  | "light"
  | "dark"
  | "halloween"
  | "diwali"
  | "thanksgiving"
  | "winter"
  | "christmas"
  | "newyear"
  | "pongal"
  | "valentines"
  | "holi"
  | "easter"
  | "eidfitr"
  | "eidadha"
  | "lunarnewyear"
  | "stpatricks";

export interface SoundPalette {
  wave: OscillatorType;
  scale: number[];
  base: number;
  decay: number;
}

export interface Theme {
  id: ThemeId;
  label: string;
  scheme: "light" | "dark";
  fx: string[] | null;
  sound: SoundPalette;
}

export const themes: Record<ThemeId, Theme> = {
  light: {
    id: "light",
    label: "Light",
    scheme: "light",
    fx: null,
    sound: { wave: "square", scale: [0, 4, 7, 12], base: 520, decay: 0.12 },
  },
  dark: {
    id: "dark",
    label: "Dark",
    scheme: "dark",
    fx: null,
    sound: { wave: "sawtooth", scale: [0, 3, 7, 10], base: 390, decay: 0.16 },
  },
  halloween: {
    id: "halloween",
    label: "Halloween",
    scheme: "dark",
    fx: ["🎃", "🦇", "👻", "🍬"],
    sound: { wave: "triangle", scale: [0, 3, 5, 10], base: 330, decay: 0.2 },
  },
  diwali: {
    id: "diwali",
    label: "Diwali",
    scheme: "dark",
    fx: ["🪔", "✨", "🎆"],
    sound: { wave: "sine", scale: [0, 4, 7, 11], base: 440, decay: 0.1 },
  },
  thanksgiving: {
    id: "thanksgiving",
    label: "Thanksgiving",
    scheme: "light",
    fx: ["🍂", "🍁", "🥧"],
    sound: { wave: "triangle", scale: [0, 2, 5, 7], base: 392, decay: 0.15 },
  },
  winter: {
    id: "winter",
    label: "Winter",
    scheme: "dark",
    fx: ["❄️", "⛄", "🧣"],
    sound: { wave: "sine", scale: [0, 5, 7, 12], base: 494, decay: 0.16 },
  },
  christmas: {
    id: "christmas",
    label: "Christmas",
    scheme: "dark",
    fx: ["🎄", "🎁", "⭐"],
    sound: { wave: "sine", scale: [0, 4, 7, 12], base: 523, decay: 0.14 },
  },
  newyear: {
    id: "newyear",
    label: "New Year",
    scheme: "dark",
    fx: ["🎉", "🎊", "🥳"],
    sound: {
      wave: "triangle",
      scale: [0, 4, 7, 9, 12],
      base: 440,
      decay: 0.12,
    },
  },
  pongal: {
    id: "pongal",
    label: "Pongal",
    scheme: "light",
    fx: ["🌾", "☀️", "🐄"],
    sound: { wave: "triangle", scale: [0, 2, 4, 7], base: 415, decay: 0.14 },
  },
  valentines: {
    id: "valentines",
    label: "Valentine’s Day",
    scheme: "light",
    fx: ["💛", "💌", "🌷"],
    sound: { wave: "sine", scale: [0, 3, 7, 12], base: 466, decay: 0.12 },
  },
  holi: {
    id: "holi",
    label: "Holi",
    scheme: "light",
    fx: ["🎨", "💦", "🌈"],
    sound: { wave: "square", scale: [0, 4, 7, 11], base: 587, decay: 0.1 },
  },
  easter: {
    id: "easter",
    label: "Easter",
    scheme: "light",
    fx: ["🐣", "🥚", "🌷"],
    sound: { wave: "triangle", scale: [0, 2, 5, 9], base: 440, decay: 0.13 },
  },
  eidfitr: {
    id: "eidfitr",
    label: "Eid al-Fitr",
    scheme: "dark",
    fx: ["🌙", "⭐", "✨", "🕌"],
    sound: { wave: "sine", scale: [0, 1, 4, 5, 7], base: 440, decay: 0.16 },
  },
  eidadha: {
    id: "eidadha",
    label: "Eid al-Adha",
    scheme: "light",
    fx: ["🌙", "🕌", "🐑", "✨"],
    sound: {
      wave: "triangle",
      scale: [0, 1, 4, 5, 7],
      base: 392,
      decay: 0.15,
    },
  },
  lunarnewyear: {
    id: "lunarnewyear",
    label: "Lunar New Year",
    scheme: "dark",
    fx: ["🏮", "🧧", "🎆", "🐉"],
    sound: {
      wave: "square",
      scale: [0, 2, 4, 7, 9],
      base: 494,
      decay: 0.1,
    },
  },
  stpatricks: {
    id: "stpatricks",
    label: "St. Patrick’s Day",
    scheme: "light",
    fx: ["☘️", "🍀", "🌈"],
    sound: {
      wave: "triangle",
      scale: [0, 2, 4, 7, 9],
      base: 587,
      decay: 0.11,
    },
  },
};

type LookupTheme = "diwali" | "holi" | "eidfitr" | "eidadha" | "lunarnewyear";

const lookupDays: Record<LookupTheme, Record<number, string>> = {
  diwali: {
    2026: "2026-11-08",
    2027: "2027-10-29",
    2028: "2028-10-17",
    2029: "2029-11-05",
    2030: "2030-10-26",
  },
  holi: {
    2026: "2026-03-04",
    2027: "2027-03-22",
    2028: "2028-03-11",
    2029: "2029-03-01",
    2030: "2030-03-20",
  },
  eidfitr: {
    2026: "2026-03-20",
    2027: "2027-03-09",
    2028: "2028-02-26",
    2029: "2029-02-14",
    2030: "2030-02-04",
  },
  eidadha: {
    2026: "2026-05-27",
    2027: "2027-05-16",
    2028: "2028-05-05",
    2029: "2029-04-24",
    2030: "2030-04-13",
  },
  lunarnewyear: {
    2026: "2026-02-17",
    2027: "2027-02-06",
    2028: "2028-01-26",
    2029: "2029-02-13",
    2030: "2030-02-03",
  },
};

function utcDay(date: Date): number {
  return (
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000
  );
}

function dateAtNoon(day: number): Date {
  return new Date(day * 86_400_000 + 12 * 60 * 60 * 1000);
}

function inWindow(
  date: Date,
  center: Date,
  before: number,
  after: number,
): boolean {
  const delta = utcDay(date) - utcDay(center);
  return delta >= -before && delta <= after;
}

function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function thanksgiving(year: number): Date {
  const first = new Date(year, 10, 1);
  const firstThursday = 1 + ((4 - first.getDay() + 7) % 7);
  return new Date(year, 10, firstThursday + 21);
}

function lookupDate(theme: LookupTheme, year: number): Date | null {
  const day = lookupDays[theme][year];
  return day ? new Date(`${day}T12:00:00`) : null;
}

export function themeForDate(date: Date): ThemeId | null {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const movableFestivals = [
    {
      theme: "diwali",
      center: lookupDate("diwali", year),
      before: 3,
      after: 2,
    },
    {
      theme: "holi",
      center: lookupDate("holi", year),
      before: 3,
      after: 1,
    },
    { theme: "easter", center: easterSunday(year), before: 6, after: 1 },
    {
      theme: "eidfitr",
      center: lookupDate("eidfitr", year),
      before: 1,
      after: 2,
    },
    {
      theme: "eidadha",
      center: lookupDate("eidadha", year),
      before: 1,
      after: 3,
    },
    {
      theme: "lunarnewyear",
      center: lookupDate("lunarnewyear", year),
      before: 2,
      after: 5,
    },
  ] as const;
  let selectedFestival: { theme: ThemeId; distance: number } | null = null;
  for (const festival of movableFestivals) {
    if (
      !festival.center ||
      !inWindow(date, festival.center, festival.before, festival.after)
    )
      continue;
    const distance = Math.abs(utcDay(date) - utcDay(festival.center));
    if (!selectedFestival || distance < selectedFestival.distance)
      selectedFestival = { theme: festival.theme, distance };
  }
  if (selectedFestival) return selectedFestival.theme;

  if (inWindow(date, thanksgiving(year), 6, 1)) return "thanksgiving";
  if (month === 1 && day >= 13 && day <= 17) return "pongal";
  if (month === 10 && day >= 15 && day <= 31) return "halloween";
  if (month === 2 && day >= 7 && day <= 14) return "valentines";
  if (month === 3 && day >= 15 && day <= 17) return "stpatricks";
  if ((month === 12 && day >= 27) || (month === 1 && day <= 2))
    return "newyear";
  if (month === 12 && day >= 1 && day <= 26) return "christmas";
  if (month === 1 && day >= 3 && day <= 31) return "winter";
  return null;
}

export function isThemeId(value: string): value is ThemeId {
  return Object.hasOwn(themes, value);
}

export function dateFromDay(day: number): Date {
  return dateAtNoon(day);
}
