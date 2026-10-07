import {
  addSample,
  compareLatest,
  HISTORY_KEY,
  parseHistory,
  type SpeedSample,
} from "../lib/history";
import { loadPlan } from "../lib/plan";

const card = document.querySelector<HTMLElement>("[data-history-card]");
const chart = document.querySelector<SVGSVGElement>("[data-history-chart]");
const summary = document.querySelector<HTMLElement>("[data-history-summary]");
const clearButton = document.querySelector<HTMLButtonElement>(
  "[data-clear-history]",
);
const svgNamespace = "http://www.w3.org/2000/svg";

function readHistory(): SpeedSample[] {
  try {
    return parseHistory(localStorage.getItem(HISTORY_KEY));
  } catch {
    return [];
  }
}

function formatSampleTime(at: number): string {
  return new Date(at).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function renderChart(samples: SpeedSample[]) {
  if (!chart) return;
  const comparison = compareLatest(samples);
  const latest = samples.at(-1)!;
  const previous = samples.at(-2)!;
  const latestDown = Math.round(latest.down);
  const previousDown = Math.round(previous.down);
  const planDown = loadPlan().down;
  const formattedPlan =
    planDown === null
      ? null
      : planDown.toLocaleString(undefined, { maximumFractionDigits: 0 });
  chart.setAttribute(
    "aria-label",
    `Download speed history. Latest: ${latestDown} Mbps. Previous: ${previousDown} Mbps.${formattedPlan === null ? "" : ` Plan: ${formattedPlan} Mbps.`}`,
  );
  chart.replaceChildren();

  const width = 600;
  const baseline = 154;
  const left = 28;
  const right = 28;
  const maximumHeight = 112;
  const maximumDown = Math.max(
    ...samples.map((sample) => sample.down),
    planDown ?? 0,
  );
  const step = (width - left - right) / samples.length;
  const barWidth = Math.min(36, step * 0.62);
  const axis = document.createElementNS(svgNamespace, "line");
  axis.setAttribute("class", "wifi-history-axis");
  axis.setAttribute("x1", String(left));
  axis.setAttribute("x2", String(width - right));
  axis.setAttribute("y1", String(baseline));
  axis.setAttribute("y2", String(baseline));
  chart.append(axis);

  samples.forEach((sample, index) => {
    const latestSample = index === samples.length - 1;
    const barHeight = Math.max(10, (sample.down / maximumDown) * maximumHeight);
    const x = left + step * index + (step - barWidth) / 2;
    const y = baseline - barHeight;
    const group = document.createElementNS(svgNamespace, "g");
    const title = document.createElementNS(svgNamespace, "title");
    title.textContent = `${formatSampleTime(sample.at)} · ${sample.down} Mbps download · ${sample.up} Mbps upload`;
    group.append(title);

    const bar = document.createElementNS(svgNamespace, "rect");
    bar.setAttribute(
      "class",
      `wifi-history-bar${latestSample ? " is-latest" : ""}`,
    );
    bar.setAttribute("x", x.toFixed(1));
    bar.setAttribute("y", y.toFixed(1));
    bar.setAttribute("width", barWidth.toFixed(1));
    bar.setAttribute("height", barHeight.toFixed(1));
    bar.setAttribute("rx", "6");
    group.append(bar);

    const value = document.createElementNS(svgNamespace, "text");
    value.setAttribute(
      "class",
      `wifi-history-value${latestSample ? " is-latest" : ""}`,
    );
    value.setAttribute("x", (x + barWidth / 2).toFixed(1));
    value.setAttribute("y", String(Math.max(18, y - 8)));
    value.setAttribute("text-anchor", "middle");
    value.textContent = String(Math.round(sample.down));
    group.append(value);
    chart.append(group);
  });

  if (planDown !== null && formattedPlan !== null) {
    const y = baseline - (planDown / maximumDown) * maximumHeight;
    const line = document.createElementNS(svgNamespace, "line");
    line.setAttribute("class", "wifi-history-plan-line");
    line.setAttribute("x1", String(left));
    line.setAttribute("x2", String(width - right));
    line.setAttribute("y1", y.toFixed(1));
    line.setAttribute("y2", y.toFixed(1));
    chart.append(line);

    const label = document.createElementNS(svgNamespace, "text");
    label.setAttribute("class", "wifi-history-plan-label");
    label.setAttribute("x", String(width - right));
    label.setAttribute("y", String(Math.max(14, y - 6)));
    label.setAttribute("text-anchor", "end");
    label.textContent = `Plan ${formattedPlan}`;
    chart.append(label);
  }

  if (summary && comparison) {
    summary.textContent =
      comparison.direction === "same"
        ? "Same speed as last time"
        : `${Math.abs(comparison.delta)} Mbps ${comparison.direction} than last time`;
  }
}

function renderHistoryCard() {
  if (!card) return;
  const samples = readHistory();
  if (samples.length < 2) {
    card.hidden = true;
    chart?.replaceChildren();
    if (summary) summary.textContent = "";
    return;
  }
  card.hidden =
    document.documentElement.dataset.dev === "1" ||
    document.documentElement.dataset.tv === "1";
  if (!card.hidden) renderChart(samples);
}

export function recordSpeedSample(sample: SpeedSample) {
  try {
    const next = addSample(readHistory(), sample);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    return;
  }
  renderHistoryCard();
}

clearButton?.addEventListener("click", () => {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {}
  renderHistoryCard();
});

document.addEventListener("gts:dev-change", renderHistoryCard);
document.addEventListener("gts:tv-change", renderHistoryCard);
document.addEventListener("gts:plan-change", renderHistoryCard);
renderHistoryCard();
