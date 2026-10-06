export const LOCALES = ["en", "ta", "hi", "es", "pt", "fr", "de"] as const;

export type Locale = (typeof LOCALES)[number];

export const LOCALE_INFO: Record<
  Locale,
  { native: string; english: string; intl: string; og: string }
> = {
  en: { native: "English", english: "English", intl: "en-US", og: "en_US" },
  ta: { native: "தமிழ்", english: "Tamil", intl: "ta-IN", og: "ta_IN" },
  hi: { native: "हिन्दी", english: "Hindi", intl: "hi-IN", og: "hi_IN" },
  es: { native: "Español", english: "Spanish", intl: "es", og: "es_ES" },
  pt: {
    native: "Português",
    english: "Portuguese",
    intl: "pt-BR",
    og: "pt_BR",
  },
  fr: { native: "Français", english: "French", intl: "fr-FR", og: "fr_FR" },
  de: { native: "Deutsch", english: "German", intl: "de-DE", og: "de_DE" },
};

export const LOCALE_STORAGE_KEY = "gts:locale";

const formatterCache = new Map<string, Intl.NumberFormat>();

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && LOCALES.includes(value as Locale);
}

export function localeHome(locale: Locale): string {
  return locale === "en" ? "/" : `/${locale}/`;
}

export function formatNumber(
  value: number,
  locale: Locale,
  options?: Intl.NumberFormatOptions,
): string {
  const optionKey = JSON.stringify(options ?? {});
  const key = `${locale}:${optionKey}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(LOCALE_INFO[locale].intl, options);
    formatterCache.set(key, formatter);
  }
  return formatter.format(value);
}
