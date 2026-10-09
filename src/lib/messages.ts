import * as messages from "../paraglide/messages.js";
import { getLocale, setLocale } from "../paraglide/runtime.js";
import { isLocale, type Locale } from "./i18n";

type MessageKey = keyof typeof messages;
type MessageParams = Record<string, string | number | boolean>;
type MessageFunction = (
  params: MessageParams,
  options: { locale: Locale },
) => string;

export function t(
  key: MessageKey,
  params: MessageParams = {},
  locale: Locale = getLocale() as Locale,
): string {
  const message = messages[key] as unknown as MessageFunction;
  return message(params, { locale });
}

export function initializeClientLocale(): Locale {
  const pageLocale = document.documentElement.lang;
  const locale = isLocale(pageLocale) ? pageLocale : "en";
  setLocale(locale, { reload: false });
  return locale;
}
