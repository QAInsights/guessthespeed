import { formatNumber, type Locale } from "./i18n";
import { t } from "./messages";

export interface ShareInput {
  players: { name: string; score: number }[];
  lastActual?: { down: number; up: number } | null;
  audience?: "family" | "team";
  locale?: Locale;
}

export const SHARE_URL = "https://guessthespeed.com/";

const medals = ["🥇", "🥈", "🥉"];

export function joinNames(names: string[], locale: Locale = "en") {
  if (names.length < 2) return names[0] ?? "";
  return t(
    "share_names_join",
    { names: names.slice(0, -1).join(", "), last: names.at(-1) ?? "" },
    locale,
  );
}

export function buildPodiumEntries<T extends { score: number }>(
  players: readonly T[],
) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  let place = 0;
  return sorted.flatMap((player, index) => {
    if (index === 0 || player.score !== sorted[index - 1].score)
      place = index + 1;
    return place <= 3
      ? [{ player, place, medal: medals[place - 1] ?? "⭐" }]
      : [];
  });
}

function formatScoreLabel(points: number, locale: Locale) {
  return t(
    points === 1 ? "share_points_one" : "share_points_many",
    { count: formatNumber(points, locale) },
    locale,
  );
}

function formatMbps(value: number, locale: Locale) {
  return formatNumber(value, locale, {
    minimumFractionDigits: value >= 100 ? 0 : 1,
    maximumFractionDigits: 1,
  });
}

export function buildSharePayload(input: ShareInput) {
  const locale = input.locale ?? "en";
  const msg = (
    key: Parameters<typeof t>[0],
    params: Record<string, string | number | boolean> = {},
  ) => t(key, params, locale);
  const sorted = [...input.players].sort((a, b) => b.score - a.score);
  const team = input.audience === "team";
  const prompt = msg(team ? "share_prompt_team" : "share_prompt_family");
  if (!sorted.length || sorted.every((player) => player.score === 0)) {
    return {
      text: msg("share_zero", { prompt }),
      url: SHARE_URL,
    };
  }

  const winners = sorted.filter((player) => player.score === sorted[0].score);
  const winnerLine =
    winners.length === 1
      ? `🏆 ${msg("share_winner_one", { name: winners[0].name })}`
      : `🏆 ${msg("share_winner_many", {
          names: joinNames(
            winners.map((player) => player.name),
            locale,
          ),
        })}`;
  const podiumLine = buildPodiumEntries(input.players)
    .map(({ player, medal }) =>
      msg("share_award", {
        medal,
        name: player.name,
        points: formatScoreLabel(player.score, locale),
      }),
    )
    .join(" · ");
  const lines = [winnerLine, podiumLine];
  if (input.lastActual) {
    lines.push(
      team
        ? msg("share_last_team", {
            down: formatMbps(input.lastActual.down, locale),
            up: formatMbps(input.lastActual.up, locale),
          })
        : msg("share_last_family", {
            down: formatMbps(input.lastActual.down, locale),
            up: formatMbps(input.lastActual.up, locale),
          }),
    );
  }
  lines.push(prompt);
  return { text: lines.join("\n"), url: SHARE_URL };
}

export function buildShareText(input: ShareInput) {
  const { text, url } = buildSharePayload(input);
  return `${text} ${url}`;
}
