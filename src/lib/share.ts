export interface ShareInput {
  players: { name: string; score: number }[];
  lastActual?: { down: number; up: number } | null;
}

export const SHARE_URL = "https://guessthespeed.com/";

const medals = ["🥇", "🥈", "🥉"];

export function joinNames(names: string[]) {
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

function formatScoreLabel(points: number) {
  return `${points} ${points === 1 ? "pt" : "pts"}`;
}

function formatMbps(value: number) {
  return value >= 100
    ? value.toLocaleString(undefined, { maximumFractionDigits: 1 })
    : value.toFixed(1);
}

export function buildSharePayload(input: ShareInput) {
  const sorted = [...input.players].sort((a, b) => b.score - a.score);
  if (!sorted.length || sorted.every((player) => player.score === 0)) {
    return {
      text: "We just played Guess the Speed! Can your family beat us?",
      url: SHARE_URL,
    };
  }

  const winners = sorted.filter((player) => player.score === sorted[0].score);
  const winnerLine =
    winners.length === 1
      ? `🏆 ${winners[0].name} won Guess the Speed!`
      : `🏆 ${joinNames(winners.map((player) => player.name))} tied for the win at Guess the Speed!`;
  const podiumLine = buildPodiumEntries(input.players)
    .map(
      ({ player, medal }) =>
        `${medal} ${player.name} ${formatScoreLabel(player.score)}`,
    )
    .join(" · ");
  const lines = [winnerLine, podiumLine];
  if (input.lastActual) {
    lines.push(
      `Our internet hit ${formatMbps(input.lastActual.down)} Mbps down and ${formatMbps(input.lastActual.up)} Mbps up.`,
    );
  }
  lines.push("Can your family beat us?");
  return { text: lines.join("\n"), url: SHARE_URL };
}

export function buildShareText(input: ShareInput) {
  const { text, url } = buildSharePayload(input);
  return `${text} ${url}`;
}
