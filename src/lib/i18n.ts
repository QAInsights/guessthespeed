export const LOCALES = ["en", "ta", "es"] as const;

export type Locale = (typeof LOCALES)[number];

export const LOCALE_INFO: Record<
  Locale,
  { nativeName: string; numberLocale: string; ogLocale: string; home: string }
> = {
  en: {
    nativeName: "English",
    numberLocale: "en-US",
    ogLocale: "en_US",
    home: "/",
  },
  ta: {
    nativeName: "தமிழ்",
    numberLocale: "ta-IN-u-nu-latn",
    ogLocale: "ta_IN",
    home: "/ta/",
  },
  es: {
    nativeName: "Español",
    numberLocale: "es-419",
    ogLocale: "es_419",
    home: "/es/",
  },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && LOCALES.includes(value as Locale);
}

export function localizedPath(
  path: "/" | "/classroom/" | "/work/",
  locale: Locale,
): string {
  if (locale === "en") return path;
  return path === "/" ? LOCALE_INFO[locale].home : `/${locale}${path}`;
}

export function formatNumber(
  value: number,
  locale: Locale,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(
    LOCALE_INFO[locale].numberLocale,
    options,
  ).format(value);
}
