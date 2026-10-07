import { fetchConnectionInfo, type ConnectionInfo } from "../lib/connection";
import {
  buildExport,
  countedSamples,
  maskIp,
  percentile,
} from "../lib/devdata";
import { sizeLabel } from "../lib/progress";
import {
  SPEED_TEST_CONFIG,
  SPEED_TEST_MEASUREMENTS,
  type SerializableBandwidthPoint,
  type SpeedDetails,
} from "../lib/speedtest";
import { escapeHtml } from "../lib/html";
import { $ } from "./dom";

type BrowserDetails = Record<string, string | number | boolean>;
type Direction = "download" | "upload";

let connection: ConnectionInfo | null = null;
let connectionLoading = false;
let showIp = false;
let details: SpeedDetails | null = null;
let browserDetails = readBrowserDetails();
let connectionRequest = 0;

const connectionContent = $<HTMLDivElement>("[data-connection-content]");
const summaryContent = $<HTMLDivElement>("[data-summary-content]");
const latencyContent = $<HTMLDivElement>("[data-latency-content]");
const requestsContent = $<HTMLDivElement>("[data-requests-content]");
const percentileContent = $<HTMLDivElement>("[data-percentile-content]");
const configContent = $<HTMLDivElement>("[data-config-content]");
const browserContent = $<HTMLDivElement>("[data-browser-content]");
const copyButton = $<HTMLButtonElement>("[data-copy-json]");
const downloadButton = $<HTMLButtonElement>("[data-download-json]");
const copyStatus = $<HTMLSpanElement>("[data-copy-status]");

function isDevMode() {
  return document.documentElement.dataset.dev === "1";
}

function readBrowserDetails(): BrowserDetails {
  const nav = navigator as Navigator & {
    connection?: {
      effectiveType?: string;
      downlink?: number;
      rtt?: number;
      saveData?: boolean;
    };
    deviceMemory?: number;
  };
  const network = nav.connection;
  const networkValues: BrowserDetails = network
    ? {
        effectiveType: network.effectiveType ?? "unavailable",
        downlinkMbps: network.downlink ?? "unavailable",
        rttMs: network.rtt ?? "unavailable",
        saveData: network.saveData ?? "unavailable",
      }
    : { connection: "not exposed by this browser" };

  return {
    userAgent: navigator.userAgent,
    ...networkValues,
    hardwareConcurrency: navigator.hardwareConcurrency ?? "unavailable",
    deviceMemoryGB: nav.deviceMemory ?? "unavailable",
    screen: `${screen.width} × ${screen.height} @ ${window.devicePixelRatio}x`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "unavailable",
    language: navigator.language || "unavailable",
    online: navigator.onLine,
  };
}

function displayValue(value: unknown, digits = 2): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "unavailable";
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: digits,
    }).format(value);
  }
  if (value === null || value === undefined || value === "")
    return "unavailable";
  return String(value);
}

function renderPairs(entries: [string, unknown][]): string {
  return `<dl class="dev-kv">${entries
    .map(
      ([label, value]) =>
        `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`,
    )
    .join("")}</dl>`;
}

function renderConnection() {
  if (connectionLoading) {
    connectionContent.innerHTML =
      "<p>Checking the Cloudflare connection...</p>";
    return;
  }
  if (!connection) {
    connectionContent.innerHTML =
      "<p>Choose Dev in the Game / Dev switch at the top of the home screen to check this connection.</p>";
    return;
  }
  const ip = showIp ? connection.ip : maskIp(connection.ip);
  const entries: [string, unknown][] = [
    ["Cloudflare colo", connection.colo],
    ["City", connection.city],
    ["Country", connection.country],
    ["ASN", connection.asn],
    ["Network", connection.network],
    ["IP address", ip],
    ["IP version", connection.ipVersion],
    ["HTTP protocol", connection.http],
    ["TLS version", connection.tls],
    ["WARP", connection.warp],
    [
      "Edge RTT",
      connection.edgeRttMs === null
        ? "unavailable"
        : `${displayValue(connection.edgeRttMs)} ms`,
    ],
    [
      "Minimum edge RTT",
      connection.minRttMs === null
        ? "unavailable"
        : `${displayValue(connection.minRttMs)} ms`,
    ],
  ];
  connectionContent.innerHTML = `<dl class="dev-kv">${entries
    .map(([label, value]) =>
      label === "IP address"
        ? `<dt>${escapeHtml(label)}</dt><dd class="dev-ip-value"><span>${escapeHtml(value)}</span><button class="dev-ip-control" type="button" data-toggle-ip aria-label="${showIp ? "Hide" : "Show"} IP address">${showIp ? "Hide" : "Show"}</button></dd>`
        : `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`,
    )
    .join(
      "",
    )}</dl><p class="dev-privacy-note">Shown only on this screen. Never stored or sent anywhere.</p>`;
}

function getSummaryValue(
  details: SpeedDetails,
  key: string,
): number | undefined {
  const value = details.summary[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function renderSummary() {
  if (!details) {
    summaryContent.innerHTML = "<p>Run a speed test to see results.</p>";
    return;
  }
  const down = getSummaryValue(details, "download");
  const up = getSummaryValue(details, "upload");
  const latency = getSummaryValue(details, "latency");
  const jitter = getSummaryValue(details, "jitter");
  const duration =
    details.totalDurationMs ?? getSummaryValue(details, "totalDurationMs");
  const scores = (["streaming", "gaming", "rtc"] as const)
    .map((key) => {
      const score = details?.scores?.[key];
      return score
        ? `${key}: ${score.classificationName} (${score.points} pts)`
        : null;
    })
    .filter((value): value is string => value !== null);
  const bandwidthRequests = details.download.length + details.upload.length;

  summaryContent.innerHTML = renderPairs([
    [
      "Download",
      down === undefined ? "unavailable" : `${displayValue(down / 1e6)} Mbps`,
    ],
    [
      "Upload",
      up === undefined ? "unavailable" : `${displayValue(up / 1e6)} Mbps`,
    ],
    [
      "Median ping",
      latency === undefined ? "unavailable" : `${displayValue(latency)} ms`,
    ],
    [
      "Jitter",
      jitter === undefined ? "unavailable" : `${displayValue(jitter)} ms`,
    ],
    [
      "Total duration",
      duration === undefined
        ? "in progress"
        : `${displayValue(duration / 1000)} s`,
    ],
    ["Number of requests", bandwidthRequests + details.latencyPoints.length],
    ["Bandwidth requests", bandwidthRequests],
    ["Bandwidth percentile", `P${SPEED_TEST_CONFIG.bandwidthPercentile * 100}`],
    [
      "AIM experience scores",
      scores.length
        ? scores.join("; ")
        : details.totalDurationMs !== undefined
          ? "Not measured (needs loaded latency and packet loss)"
          : "not available yet",
    ],
  ]);
}

function sparkline(values: number[]): string {
  if (!values.length) return "";
  const width = 360;
  const height = 66;
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  const points = values
    .map((value, index) => {
      const x =
        values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * (height - 12) - 6;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return `<svg class="dev-sparkline" viewBox="0 0 ${width} ${height}" role="img" aria-label="Latency samples sparkline"><polyline points="${points}" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" /></svg>`;
}

function renderLatency() {
  if (!details || !details.latencyPoints.length) {
    latencyContent.innerHTML = "<p>Latency samples will appear here.</p>";
    return;
  }
  const values = details.latencyPoints;
  const rows = values
    .map(
      (value, index) =>
        `<tr><td>${index + 1}</td><td>${index === 0 ? "Warm-up ping" : `Sample ${index + 1}`}</td><td>${displayValue(value)} ms</td></tr>`,
    )
    .join("");
  const jitter = getSummaryValue(details, "jitter");
  latencyContent.innerHTML = `${renderPairs([
    ["Minimum", `${displayValue(Math.min(...values))} ms`],
    ["Median", `${displayValue(percentile(values, 0.5))} ms`],
    ["Maximum", `${displayValue(Math.max(...values))} ms`],
    [
      "Jitter",
      jitter === undefined ? "unavailable" : `${displayValue(jitter)} ms`,
    ],
  ])}${sparkline(values)}<div class="dev-data-table-wrap"><table class="dev-data-table dev-table-compact"><thead><tr><th>#</th><th>Sample</th><th>Ping</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

interface RequestRow {
  direction: Direction;
  point: SerializableBandwidthPoint;
}

function requestRows(): RequestRow[] {
  if (!details) return [];
  return [
    ...details.download.map((point) => ({
      direction: "download" as const,
      point,
    })),
    ...details.upload.map((point) => ({ direction: "upload" as const, point })),
  ].sort((a, b) => Date.parse(a.point.measTime) - Date.parse(b.point.measTime));
}

function renderRequestBars(rows: RequestRow[]): string {
  if (!rows.length) return "";
  const width = Math.max(360, rows.length * 14);
  const height = 80;
  const baseline = height - 5;
  const maxBps = Math.max(...rows.map(({ point }) => point.bps), 1);
  const bars = rows
    .map(({ direction, point }, index) => {
      const barHeight = Math.max(2, (point.bps / maxBps) * (height - 12));
      const x = index * 14 + 2;
      const y = baseline - barHeight;
      const color = direction === "download" ? "var(--accent)" : "var(--ink)";
      return `<rect x="${x}" y="${y.toFixed(1)}" width="9" height="${barHeight.toFixed(1)}" rx="2" fill="${color}"><title>${escapeHtml(direction)}: ${displayValue(point.bps / 1e6)} Mbps</title></rect>`;
    })
    .join("");
  return `<svg class="dev-bars" viewBox="0 0 ${width} ${height}" role="img" aria-label="Mbps per request bar chart">${bars}</svg><p>Download <span style="color:var(--accent)" aria-hidden="true">■</span> · Upload <span style="color:var(--ink)" aria-hidden="true">■</span></p>`;
}

function renderRequests() {
  const rows = requestRows();
  if (!rows.length) {
    requestsContent.innerHTML = "<p>Bandwidth requests will appear here.</p>";
    return;
  }
  const counted = new Set([
    ...countedSamples(
      details!.download,
      SPEED_TEST_CONFIG.bandwidthMinRequestDuration,
    ),
    ...countedSamples(
      details!.upload,
      SPEED_TEST_CONFIG.bandwidthMinRequestDuration,
    ),
  ]);
  const body = rows
    .map(({ direction, point }, index) => {
      const elapsedMs = Date.parse(point.measTime) - details!.startedAt;
      return `<tr><td>${index + 1}</td><td>${escapeHtml(direction)}</td><td>${sizeLabel(point.bytes)}</td><td>${displayValue(point.duration)} ms</td><td>${point.serverTime === -1 ? "n/a" : `${displayValue(point.serverTime)} ms`}</td><td>${displayValue(point.ping)} ms</td><td>${displayValue(point.transferSize, 0)}</td><td>${displayValue(point.bps / 1e6)} Mbps</td><td>${counted.has(point) ? "yes" : "no"}</td><td>${displayValue(elapsedMs / 1000)} s</td></tr>`;
    })
    .join("");
  requestsContent.innerHTML = `${renderRequestBars(rows)}<div class="dev-data-table-wrap"><table class="dev-data-table"><thead><tr><th>#</th><th>Direction</th><th>Size</th><th>Duration</th><th>Server time</th><th>Ping</th><th>Transfer bytes</th><th>Mbps</th><th>Counted</th><th>Run offset</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

function formatPercentile(
  direction: Direction,
  points: SerializableBandwidthPoint[],
) {
  const counted = countedSamples(
    points,
    SPEED_TEST_CONFIG.bandwidthMinRequestDuration,
  )
    .slice()
    .sort((a, b) => a.bps - b.bps);
  if (!counted.length)
    return `<div class="dev-subsection"><h4>${direction === "download" ? "Download" : "Upload"}</h4><p>No counted samples yet.</p></div>`;
  const values = counted.map((point) => point.bps);
  const estimate = percentile(values, SPEED_TEST_CONFIG.bandwidthPercentile);
  const position = (counted.length - 1) * SPEED_TEST_CONFIG.bandwidthPercentile;
  const highlighted = new Set([Math.floor(position), Math.ceil(position)]);
  const libraryValue =
    direction === "download" ? details?.finalDownBps : details?.finalUpBps;
  const rows = counted
    .map(
      (point, index) =>
        `<tr class="${highlighted.has(index) ? "dev-highlight" : ""}"><td>${index + 1}</td><td>${sizeLabel(point.bytes)}</td><td>${displayValue(point.duration)} ms</td><td>${displayValue(point.bps / 1e6)} Mbps</td><td>${escapeHtml(point.measTime)}</td></tr>`,
    )
    .join("");
  const matches =
    libraryValue !== undefined &&
    Math.abs(estimate - libraryValue) / Math.max(Math.abs(libraryValue), 1) <=
      0.001;
  const comparison =
    libraryValue === undefined
      ? "Library value pending"
      : matches
        ? "matches library"
        : `Recomputed ${displayValue(estimate / 1e6)} Mbps · Library ${displayValue(libraryValue / 1e6)} Mbps`;
  return `<div class="dev-subsection"><h4>${direction === "download" ? "Download" : "Upload"} · P${SPEED_TEST_CONFIG.bandwidthPercentile * 100}</h4><p>Counted samples sorted by Mbps. Highlighted row${highlighted.size > 1 ? "s" : ""} show where the percentile lands. ${escapeHtml(comparison)}</p><div class="dev-data-table-wrap"><table class="dev-data-table"><thead><tr><th>#</th><th>Size</th><th>Duration</th><th>Mbps</th><th>Measured at</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function renderPercentiles() {
  if (!details) {
    percentileContent.innerHTML =
      "<p>Counted samples and the final percentile will appear here.</p>";
    return;
  }
  percentileContent.innerHTML = `${formatPercentile("download", details.download)}${formatPercentile("upload", details.upload)}`;
}

function readableMeasurement(
  measurement: (typeof SPEED_TEST_MEASUREMENTS)[number],
  index: number,
): string {
  if (measurement.type === "latency")
    return `Ping · ${measurement.numPackets} ${measurement.numPackets === 1 ? "packet" : "packets"}${index === 0 ? " · warm-up" : ""}`;
  const direction = measurement.type === "download" ? "Download" : "Upload";
  return `${direction} · ${sizeLabel(measurement.bytes)} × ${measurement.count}${"bypassMinDuration" in measurement ? " · warm-up" : ""}`;
}

function renderConfig() {
  const measurements = SPEED_TEST_MEASUREMENTS.map(readableMeasurement)
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  configContent.innerHTML = `${renderPairs([
    ["Download endpoint", SPEED_TEST_CONFIG.downloadEndpoint],
    ["Upload endpoint", SPEED_TEST_CONFIG.uploadEndpoint],
    ["Latency percentile", `P${SPEED_TEST_CONFIG.latencyPercentile * 100}`],
    ["Bandwidth percentile", `P${SPEED_TEST_CONFIG.bandwidthPercentile * 100}`],
    [
      "Minimum counted duration",
      `${SPEED_TEST_CONFIG.bandwidthMinRequestDuration} ms`,
    ],
    [
      "Finish request duration",
      `${SPEED_TEST_CONFIG.bandwidthFinishRequestDuration} ms`,
    ],
    ["Stall timeout", `${SPEED_TEST_CONFIG.stallTimeoutMs / 1000} s`],
    ["@cloudflare/speedtest", SPEED_TEST_CONFIG.libraryVersion],
  ])}<details open><summary>Measurement list (${SPEED_TEST_MEASUREMENTS.length} steps)</summary><ol>${measurements}</ol></details>`;
}

function renderBrowser() {
  browserContent.innerHTML = renderPairs(Object.entries(browserDetails));
}

function renderResults() {
  renderSummary();
  renderLatency();
  renderRequests();
  renderPercentiles();
  syncExportButtons();
}

function buildRunExport(): Record<string, unknown> | null {
  if (!details) return null;
  const finishedAt =
    details.totalDurationMs === undefined
      ? null
      : new Date(details.startedAt + details.totalDurationMs).toISOString();
  return buildExport({
    startedAt: new Date(details.startedAt).toISOString(),
    finishedAt,
    totalDurationMs: details.totalDurationMs ?? null,
    connection,
    summary: details.summary,
    latencyPoints: details.latencyPoints,
    download: details.download,
    upload: details.upload,
    config: {
      ...SPEED_TEST_CONFIG,
      measurements: SPEED_TEST_MEASUREMENTS,
    },
    browser: browserDetails,
  }) as Record<string, unknown>;
}

function syncExportButtons() {
  const available = Boolean(details?.totalDurationMs !== undefined);
  copyButton.disabled = !available;
  downloadButton.disabled = !available;
}

async function loadConnectionInfo() {
  if (!isDevMode()) return;
  const request = ++connectionRequest;
  connectionLoading = true;
  renderConnection();
  try {
    const nextConnection = await fetchConnectionInfo();
    if (request !== connectionRequest || !isDevMode()) return;
    connection = nextConnection;
    showIp = false;
  } catch {
    if (request !== connectionRequest || !isDevMode()) return;
    connection = {
      colo: "unavailable",
      city: "unavailable",
      country: "unavailable",
      asn: "unavailable",
      network: "unavailable",
      ip: "unavailable",
      ipVersion: "unavailable",
      http: "unavailable",
      tls: "unavailable",
      warp: "unavailable",
      edgeRttMs: null,
      minRttMs: null,
    };
  } finally {
    if (request === connectionRequest && isDevMode()) {
      connectionLoading = false;
      renderConnection();
    }
  }
}

connectionContent.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  if (!target.closest("[data-toggle-ip]")) return;
  showIp = !showIp;
  renderConnection();
});

copyButton.addEventListener("click", async () => {
  const run = buildRunExport();
  if (!run) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(run, null, 2));
    copyStatus.textContent = "Copied";
  } catch {
    copyStatus.textContent = "Could not copy";
  }
  window.setTimeout(() => {
    copyStatus.textContent = "";
  }, 1800);
});

downloadButton.addEventListener("click", () => {
  const run = buildRunExport();
  if (!run) return;
  const timestamp = details
    ? new Date(details.startedAt).toISOString()
    : new Date().toISOString();
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(run, null, 2)], {
      type: "application/json",
    }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `guessthespeed-run-${timestamp}.json`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
});

document.addEventListener("gts:dev-change", (event) => {
  const enabled = (event as CustomEvent<boolean>).detail;
  if (enabled) {
    browserDetails = readBrowserDetails();
    renderBrowser();
    void loadConnectionInfo();
  } else {
    connectionRequest += 1;
    connectionLoading = false;
  }
});

document.addEventListener("gts:dev-run-start", () => {
  if (!isDevMode()) return;
  details = null;
  browserDetails = readBrowserDetails();
  renderBrowser();
  renderResults();
  void loadConnectionInfo();
});

document.addEventListener("gts:dev-details", (event) => {
  if (!isDevMode()) return;
  details = (event as CustomEvent<SpeedDetails>).detail;
  renderResults();
});

renderConfig();
renderBrowser();
renderConnection();
renderResults();
if (isDevMode()) void loadConnectionInfo();
