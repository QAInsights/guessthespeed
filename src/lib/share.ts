import { formatNumber, LOCALE_INFO, localeHome, type Locale } from "./i18n";
import * as m from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";

export interface ShareInput {
  players: { name: string; score: number }[];
  lastActual?: { down: number; up: number } | null;
}

export function shareUrl(locale: Locale = getLocale()): string {
  return `https://guessthespeed.com${localeHome(locale)}`;
}

export const SHARE_URL = shareUrl("en");

const medals = ["🥇", "🥈", "🥉"];

export function joinNames(names: string[], locale: Locale = "en") {
  if (locale !== "en")
    return new Intl.ListFormat(LOCALE_INFO[locale].intl, {
      type: "conjunction",
    }).format(names);
  if (names.length < 2) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export function buildPodiumEntries<T extends { score: number }>(
  players: readonly T[],
) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  let place = 0;
  return sorted.slice(0, 3).map((player, index) => {
    if (index === 0 || player.score !== sorted[index - 1].score)
      place = index + 1;
    return { player, place, medal: medals[place - 1] ?? "⭐" };
  });
}

export function buildSharePayload(
  input: ShareInput,
  locale: Locale = getLocale(),
) {
  const url = shareUrl(locale);
  const sorted = [...input.players].sort((a, b) => b.score - a.score);
  if (!sorted.length || sorted.every((player) => player.score === 0)) {
    return {
      text: m.share_fallback({}, { locale }),
      url,
    };
  }

  const winners = sorted.filter((player) => player.score === sorted[0].score);
  const winnerLine =
    winners.length === 1
      ? m.share_winner_single({ name: winners[0].name }, { locale })
      : m.share_winner_tie(
          {
            names: joinNames(
              winners.map((player) => player.name),
              locale,
            ),
          },
          { locale },
        );
  const podiumLine = buildPodiumEntries(input.players)
    .map(({ player, medal }) =>
      m.share_podium_entry(
        {
          medal,
          name: player.name,
          score: formatNumber(player.score, locale),
          count: player.score,
        },
        { locale },
      ),
    )
    .join(" · ");
  const lines = [winnerLine, podiumLine];
  if (input.lastActual) {
    lines.push(
      m.share_actual_speeds(
        {
          down: formatNumber(
            input.lastActual.down,
            locale,
            input.lastActual.down >= 100
              ? { maximumFractionDigits: 1 }
              : { minimumFractionDigits: 1, maximumFractionDigits: 1 },
          ),
          up: formatNumber(
            input.lastActual.up,
            locale,
            input.lastActual.up >= 100
              ? { maximumFractionDigits: 1 }
              : { minimumFractionDigits: 1, maximumFractionDigits: 1 },
          ),
        },
        { locale },
      ),
    );
  }
  lines.push(m.share_invitation({}, { locale }));
  return { text: lines.join("\n"), url };
}

export function buildShareText(
  input: ShareInput,
  locale: Locale = getLocale(),
) {
  const { text, url } = buildSharePayload(input, locale);
  return `${text} ${url}`;
}
