import { formatPlayStat, type PlayTotals, type StatEvent } from "../lib/stats";

export function sendStat(event: StatEvent): void {
  try {
    void fetch("/api/stats", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
      keepalive: true,
    }).catch(() => {});
  } catch {
    return;
  }
}

function isPlayTotals(value: unknown): value is PlayTotals {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const totals = value as Record<string, unknown>;
  return ["rounds", "games", "guesses"].every(
    (key) =>
      typeof totals[key] === "number" &&
      Number.isInteger(totals[key]) &&
      totals[key] >= 0,
  );
}

export async function loadPlayStat(): Promise<void> {
  const elements = Array.from(
    document.querySelectorAll<HTMLElement>("[data-play-stat]"),
  );
  if (!elements.length || document.documentElement.dataset.dev === "1") return;

  try {
    const response = await fetch("/api/stats", {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return;
    const totals: unknown = await response.json();
    if (!isPlayTotals(totals)) return;

    for (const element of elements) {
      const text = element.querySelector<HTMLElement>("[data-play-stat-text]");
      if (!text) continue;
      const formatted = formatPlayStat(totals, {
        short: element.hasAttribute("data-play-stat-short"),
      });
      if (!formatted) continue;
      text.textContent = formatted;
      element.hidden = false;
    }
  } catch {
    return;
  }
}
