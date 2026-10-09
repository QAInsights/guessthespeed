import {
  normalizeTotals,
  playStatRounds,
  type PlayTotals,
  type PlayMode,
  type StatEvent,
} from "../lib/stats";
import { formatNumber, LOCALE_INFO } from "../lib/i18n";
import { initializeClientLocale, t } from "../lib/messages";

const locale = initializeClientLocale();
const integerFormat = new Intl.NumberFormat(LOCALE_INFO[locale].numberLocale);
const oneDecimalFormat = new Intl.NumberFormat(
  LOCALE_INFO[locale].numberLocale,
  {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  },
);
const percentFormat = new Intl.NumberFormat(LOCALE_INFO[locale].numberLocale, {
  maximumFractionDigits: 1,
});

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

function countUp(
  element: HTMLElement,
  target: number,
  format: (value: number) => string,
): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    element.textContent = format(target);
    return;
  }

  const startedAt = performance.now();
  const duration = 850;
  const draw = (now: number) => {
    const progress = Math.min(1, (now - startedAt) / duration);
    const eased = 1 - (1 - progress) ** 3;
    element.textContent = format(target * eased);
    if (progress < 1) requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}

export async function loadPublicStats(): Promise<void> {
  const page = document.querySelector<HTMLElement>("[data-stats-page]");
  if (!page) return;
  const status = page.querySelector<HTMLElement>("[data-stats-status]");
  const error = page.querySelector<HTMLElement>("[data-stats-error]");

  try {
    const response = await fetch("/api/stats", {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("Stats request failed");
    const value: unknown = await response.json();
    if (!isPlayTotals(value)) throw new Error("Stats response was invalid");
    const totals = normalizeTotals(value);

    const animate = (
      key: string,
      target: number,
      format: (value: number) => string,
    ) => {
      const element = page.querySelector<HTMLElement>(
        `[data-stat-value="${key}"]`,
      );
      if (element) countUp(element, target, format);
    };
    animate("rounds", totals.rounds, (value) =>
      integerFormat.format(Math.round(value)),
    );
    animate("games", totals.games, (value) =>
      integerFormat.format(Math.round(value)),
    );
    animate("guesses", totals.guesses, (value) =>
      integerFormat.format(Math.round(value)),
    );
    animate("spotOns", totals.spotOns, (value) =>
      integerFormat.format(Math.round(value)),
    );
    const averageDown = page.querySelector<HTMLElement>(
      '[data-stat-value="averageDown"]',
    );
    if (averageDown) {
      if (totals.downRounds === 0) averageDown.textContent = "Not yet";
      else
        countUp(
          averageDown,
          totals.downSum / totals.downRounds,
          (value) => `${integerFormat.format(Math.round(value))} Mbps`,
        );
    }
    const averageMiss = page.querySelector<HTMLElement>(
      '[data-stat-value="averageMiss"]',
    );
    if (averageMiss) {
      if (totals.closestMissRounds === 0) averageMiss.textContent = "Not yet";
      else
        countUp(
          averageMiss,
          totals.closestMissSum / totals.closestMissRounds,
          (value) => `${oneDecimalFormat.format(value)}%`,
        );
    }

    const modes: PlayMode[] = ["local", "room", "work", "classroom"];
    for (const mode of modes) {
      const count = totals.modes[mode];
      const percent = totals.rounds > 0 ? (count / totals.rounds) * 100 : 0;
      const countElement = page.querySelector<HTMLElement>(
        `[data-mode-count="${mode}"]`,
      );
      const percentElement = page.querySelector<HTMLElement>(
        `[data-mode-percent="${mode}"]`,
      );
      const segment = page.querySelector<HTMLElement>(
        `[data-mode-segment="${mode}"]`,
      );
      if (countElement)
        countUp(countElement, count, (value) =>
          integerFormat.format(Math.round(value)),
        );
      if (percentElement)
        countUp(
          percentElement,
          percent,
          (value) => `${percentFormat.format(value)}%`,
        );
      if (segment)
        segment.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    }

    const devRuns = page.querySelector<HTMLElement>("[data-dev-runs]");
    if (devRuns)
      countUp(devRuns, totals.devRuns, (value) =>
        integerFormat.format(Math.round(value)),
      );

    if (status) status.hidden = true;
  } catch {
    if (status) status.hidden = true;
    if (error) error.hidden = false;
  }
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
      const count = playStatRounds(normalizeTotals(totals));
      if (count === null) continue;
      text.textContent = t(
        element.hasAttribute("data-play-stat-short")
          ? "play_stat_short"
          : "play_stat_long",
        { rounds: formatNumber(count, locale) },
        locale,
      );
      element.hidden = false;
    }
  } catch {
    return;
  }
}
