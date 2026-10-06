import { MAX_PLAYERS } from "./room";
import { formatNumber, type Locale } from "./i18n";
import * as m from "../paraglide/messages.js";

export interface PlayTotals {
  rounds: number;
  games: number;
  guesses: number;
}

export type StatEvent = { kind: "round"; guesses: number } | { kind: "game" };

export const EMPTY_TOTALS: PlayTotals = Object.freeze({
  rounds: 0,
  games: 0,
  guesses: 0,
});

export const STAT_DISPLAY_MIN_ROUNDS = 50;

export function parseStatEvent(body: unknown): StatEvent | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const value = body as Record<string, unknown>;
  if (value.kind === "game") return { kind: "game" };
  if (
    value.kind === "round" &&
    typeof value.guesses === "number" &&
    Number.isInteger(value.guesses) &&
    value.guesses >= 1 &&
    value.guesses <= MAX_PLAYERS
  )
    return { kind: "round", guesses: value.guesses };
  return null;
}

export function addStatEvent(totals: PlayTotals, event: StatEvent): PlayTotals {
  return event.kind === "round"
    ? {
        rounds: totals.rounds + 1,
        games: totals.games,
        guesses: totals.guesses + event.guesses,
      }
    : { ...totals, games: totals.games + 1 };
}

export function formatPlayStat(
  totals: PlayTotals | null,
  options: { short?: boolean } = {},
  locale: Locale = "en",
): string | null {
  if (!totals || totals.rounds < STAT_DISPLAY_MIN_ROUNDS) return null;
  const formatted = formatNumber(totals.rounds, locale);
  return options.short
    ? m.stats_rounds_short({ count: totals.rounds, formatted }, { locale })
    : m.stats_rounds_long({ count: totals.rounds, formatted }, { locale });
}
