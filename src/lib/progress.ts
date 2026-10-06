import { formatNumber, type Locale } from "./i18n";
import * as m from "../paraglide/messages.js";

export type Phase = "ping" | "down" | "up";

export const SLOW_HINT_MS = 6000;
export const STALL_TIMEOUT_MS = 45000;

export function sizeLabel(bytes: number, locale: Locale = "en"): string {
  const kilobytes = bytes < 1e6;
  const amount = kilobytes ? bytes / 1e3 : bytes / 1e6;
  const value = formatNumber(amount, locale, {
    maximumFractionDigits: 20,
    useGrouping: false,
  });
  return `${value} ${kilobytes ? "kB" : "MB"}`;
}

export function phaseText(
  phase: Phase,
  bytes?: number,
  locale: Locale = "en",
): string {
  if (phase === "ping") return m.progress_ping({}, { locale });
  if (bytes === undefined)
    return phase === "down"
      ? m.progress_download({}, { locale })
      : m.progress_upload({}, { locale });
  const size = sizeLabel(bytes, locale);
  return phase === "down"
    ? m.progress_download_files({ size }, { locale })
    : m.progress_upload_files({ size }, { locale });
}
