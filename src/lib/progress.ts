import { formatNumber, type Locale } from "./i18n";

export type Phase = "ping" | "down" | "up";

export const SLOW_HINT_MS = 6000;
export const STALL_TIMEOUT_MS = 45000;

export function sizeLabel(bytes: number, locale: Locale = "en"): string {
  const kilobytes = bytes < 1e6;
  const amount = kilobytes ? bytes / 1e3 : bytes / 1e6;
  const value = formatNumber(amount, locale, {
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 1,
  });
  return `${value} ${kilobytes ? "kB" : "MB"}`;
}

export function phaseText(
  phase: Phase,
  bytes?: number,
): { phase: Phase; bytes?: number } {
  return bytes === undefined ? { phase } : { phase, bytes };
}
