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
import { loadDevRun, saveDevRun } from "../lib/devrun";
import { escapeHtml } from "../lib/html";
import { devUseChecks, type DevUse, pingBarFill } from "../lib/devresult";
import { gaugePosition } from "../lib/gauge";
import { loadPlan, planPercent, planTone } from "../lib/plan";
import { $ } from "./dom";
import { formatNumber } from "../lib/i18n";
import { initializeClientLocale, t } from "../lib/messages";

type BrowserDetails = Record<string, string | number | boolean>;
type Direction = "download" | "upload";

const locale = initializeClientLocale();
const msg = (
  key: Parameters<typeof t>[0],
  params: Record<string, string | number | boolean> = {},
) => t(key, params, locale);
const devLabels: Record<string, Parameters<typeof t>[0]> = {
  "Cloudflare colo": "dev_cloudflare_colo",
  City: "dev_city",
  Country: "dev_country",
  ASN: "dev_asn",
  Network: "dev_network",
  "IP address": "dev_ip_address",
  "IP version": "dev_ip_version",
  "HTTP protocol": "dev_http_protocol",
  "TLS version": "dev_tls_version",
  WARP: "dev_warp",
  "Edge RTT": "dev_edge_rtt",
  "Minimum edge RTT": "dev_min_edge_rtt",
  Download: "dev_download",
  Upload: "dev_upload",
  "Plan download": "dev_plan_download",
  "Plan upload": "dev_plan_upload",
  "Median ping": "dev_median_ping",
  Jitter: "dev_jitter",
  "Total duration": "dev_total_duration",
  "Number of requests": "dev_request_count",
  "Bandwidth requests": "dev_bandwidth_requests",
  "Bandwidth percentile": "dev_bandwidth_percentile",
  "AIM experience scores": "dev_aim_scores",
  Minimum: "dev_minimum",
  Median: "dev_median",
  Maximum: "dev_maximum",
  Direction: "dev_direction",
  Size: "dev_size",
  Duration: "dev_duration",
  "Server time": "dev_server_time",
  "Transfer bytes": "dev_transfer_bytes",
  Counted: "dev_counted",
  "Run offset": "dev_run_offset",
  "Download endpoint": "dev_download_endpoint",
  "Upload endpoint": "dev_upload_endpoint",
  "Latency percentile": "dev_latency_percentile",
  "Minimum counted duration": "dev_min_counted_duration",
  "Finish request duration": "dev_finish_request_duration",
  "Stall timeout": "dev_stall_timeout",
  "Measured at": "dev_measured_at",
  userAgent: "dev_browser_user_agent",
  effectiveType: "dev_browser_effective_type",
  downlinkMbps: "dev_browser_downlink",
  rttMs: "dev_browser_rtt",
  saveData: "dev_browser_save_data",
  connection: "dev_browser_connection",
  hardwareConcurrency: "dev_browser_hardware_concurrency",
  deviceMemoryGB: "dev_browser_device_memory",
  screen: "dev_browser_screen",
  timezone: "dev_browser_timezone",
  language: "dev_browser_language",
  online: "dev_browser_online",
  streaming: "dev_score_streaming",
  gaming: "dev_score_gaming",
  rtc: "dev_score_rtc",
  excellent: "dev_classification_excellent",
  good: "dev_classification_good",
  fair: "dev_classification_fair",
  poor: "dev_classification_poor",
};
const devText = (value: unknown): string => {
  if (typeof value === "number") return formatNumber(value, locale);
  if (typeof value === "boolean") return msg(value ? "dev_yes" : "dev_no");
  const text = String(value);
  const key = devLabels[text] ?? devLabels[text.toLowerCase()];
  if (key) return msg(key);
  if (text === "unavailable") return msg("dev_unavailable");
  if (text === "not exposed by this browser") return msg("dev_not_exposed");
  if (text === "not available yet") return msg("dev_not_available_yet");
  if (text === "in progress") return msg("dev_in_progress");
  if (text === "n/a") return msg("dev_unavailable");
  return text;
};

let connection: ConnectionInfo | null = null;
let connectionLoading = false;
let showIp = false;
let details: SpeedDetails | null = null;
let browserDetails = readBrowserDetails();
let connectionRequest = 0;
let hasCompletedRun = false;
let devRunActive = false;

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
const resultCard = $<HTMLElement>("[data-dev-result]");
const resultDown = $<HTMLElement>("[data-dev-result-down]");
const resultUp = $<HTMLElement>("[data-dev-result-up]");
const resultUpBar = $<HTMLElement>("[data-dev-result-up-bar]");
const resultPing = $<HTMLElement>("[data-dev-result-ping]");
const resultJitter = $<HTMLElement>("[data-dev-result-jitter]");
const resultPingBar = $<HTMLElement>("[data-dev-result-ping-bar]");
const resultPlan = $<HTMLElement>("[data-dev-result-plan]");
const resultUses = $<HTMLUListElement>("[data-dev-result-uses]");
const resultMeta = $<HTMLParagraphElement>("[data-dev-result-meta]");
const resultCopyButton = $<HTMLButtonElement>("[data-dev-result-copy]");
const devUseMessages: Record<DevUse, Parameters<typeof t>[0]> = {
  streaming4k: "dev_use_streaming4k",
  videoCalls: "dev_use_video_calls",
  gaming: "dev_use_gaming",
  bigUploads: "dev_use_big_uploads",
};

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
    if (!Number.isFinite(value)) return msg("dev_unavailable");
    return formatNumber(value, locale, { maximumFractionDigits: digits });
  }
  if (value === null || value === undefined || value === "")
    return msg("dev_unavailable");
  return devText(value);
}

function renderPairs(entries: [string, unknown][]): string {
  return `<dl class="dev-kv">${entries
    .map(
      ([label, value]) =>
        `<dt>${escapeHtml(devText(label))}</dt><dd>${escapeHtml(devText(value))}</dd>`,
    )
    .join("")}</dl>`;
}

function renderConnection() {
  if (connectionLoading) {
    connectionContent.innerHTML = `<p>${escapeHtml(msg("dev_checking_connection"))}</p>`;
    return;
  }
  if (!connection) {
    connectionContent.innerHTML = `<p>${escapeHtml(msg("dev_choose_mode"))}</p>`;
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
        ? `<dt>${escapeHtml(devText(label))}</dt><dd class="dev-ip-value"><span>${escapeHtml(devText(value))}</span><button class="dev-ip-control" type="button" data-toggle-ip aria-label="${msg(showIp ? "dev_ip_hide" : "dev_ip_show")} ${msg("dev_ip_address")}">${msg(showIp ? "dev_ip_hide" : "dev_ip_show")}</button></dd>`
        : `<dt>${escapeHtml(devText(label))}</dt><dd>${escapeHtml(devText(value))}</dd>`,
    )
    .join("")}</dl><p class="dev-privacy-note">${msg("dev_privacy")}</p>`;
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
    summaryContent.innerHTML = `<p>${msg("dev_run_test_prompt")}</p>`;
    return;
  }
  const down = getSummaryValue(details, "download");
  const up = getSummaryValue(details, "upload");
  const plan = loadPlan();
  const plannedDown = plan.down;
  const plannedUp = plan.up;
  const downPercent = planPercent(
    down === undefined ? undefined : down / 1e6,
    plannedDown,
  );
  const upPercent = planPercent(
    up === undefined ? undefined : up / 1e6,
    plannedUp,
  );
  const planValue = (planned: number | null, pct: number | null) =>
    planned === null
      ? msg("dev_not_set")
      : `${formatNumber(planned, locale, { maximumFractionDigits: 0 })} Mbps${pct === null ? "" : ` (${msg("dev_this_run", { percent: formatNumber(pct, locale) })})`}`;
  const latency = getSummaryValue(details, "latency");
  const jitter = getSummaryValue(details, "jitter");
  const duration =
    details.totalDurationMs ?? getSummaryValue(details, "totalDurationMs");
  const scores = (["streaming", "gaming", "rtc"] as const)
    .map((key) => {
      const score = details?.scores?.[key];
      return score
        ? `${devText(key)}: ${devText(score.classificationName)} (${formatNumber(score.points, locale)} pts)`
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
    ["Plan download", planValue(plannedDown, downPercent)],
    ["Plan upload", planValue(plannedUp, upPercent)],
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
        ? msg("dev_in_progress")
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
          ? msg("dev_not_measured")
          : msg("dev_not_available_yet"),
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
  return `<svg class="dev-sparkline" viewBox="0 0 ${width} ${height}" role="img" aria-label="${msg("dev_sparkline_aria")}"><polyline points="${points}" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" /></svg>`;
}

function renderLatency() {
  if (!details || !details.latencyPoints.length) {
    latencyContent.innerHTML = `<p>${msg("dev_latency_prompt")}</p>`;
    return;
  }
  const values = details.latencyPoints;
  const rows = values
    .map(
      (value, index) =>
        `<tr><td>${formatNumber(index + 1, locale)}</td><td>${index === 0 ? msg("dev_warmup_ping") : msg("dev_sample", { number: formatNumber(index + 1, locale) })}</td><td>${displayValue(value)} ms</td></tr>`,
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
  ])}${sparkline(values)}<div class="dev-data-table-wrap"><table class="dev-data-table dev-table-compact"><thead><tr><th>#</th><th>${msg("dev_sample_header")}</th><th>${msg("dev_ping")}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
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
      return `<rect x="${x}" y="${y.toFixed(1)}" width="9" height="${barHeight.toFixed(1)}" rx="2" fill="${color}"><title>${msg(direction === "download" ? "dev_download_direction" : "dev_upload_direction")}: ${displayValue(point.bps / 1e6)} Mbps</title></rect>`;
    })
    .join("");
  return `<svg class="dev-bars" viewBox="0 0 ${width} ${height}" role="img" aria-label="${msg("dev_bar_chart_aria")}">${bars}</svg><p>${msg("dev_download_direction")} <span style="color:var(--accent)" aria-hidden="true">■</span> · ${msg("dev_upload_direction")} <span style="color:var(--ink)" aria-hidden="true">■</span></p>`;
}

function renderRequests() {
  const rows = requestRows();
  if (!rows.length) {
    requestsContent.innerHTML = `<p>${msg("dev_requests_prompt")}</p>`;
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
      return `<tr><td>${formatNumber(index + 1, locale)}</td><td>${msg(direction === "download" ? "dev_download_direction" : "dev_upload_direction")}</td><td>${sizeLabel(point.bytes, locale)}</td><td>${displayValue(point.duration)} ms</td><td>${point.serverTime === -1 ? msg("dev_unavailable") : `${displayValue(point.serverTime)} ms`}</td><td>${displayValue(point.ping)} ms</td><td>${displayValue(point.transferSize, 0)}</td><td>${displayValue(point.bps / 1e6)} Mbps</td><td>${counted.has(point) ? msg("dev_yes") : msg("dev_no")}</td><td>${displayValue(elapsedMs / 1000)} s</td></tr>`;
    })
    .join("");
  requestsContent.innerHTML = `${renderRequestBars(rows)}<div class="dev-data-table-wrap"><table class="dev-data-table"><thead><tr><th>#</th><th>${msg("dev_direction")}</th><th>${msg("dev_size")}</th><th>${msg("dev_duration")}</th><th>${msg("dev_server_time")}</th><th>${msg("dev_ping")}</th><th>${msg("dev_transfer_bytes")}</th><th>Mbps</th><th>${msg("dev_counted")}</th><th>${msg("dev_run_offset")}</th></tr></thead><tbody>${body}</tbody></table></div>`;
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
    return `<div class="dev-subsection"><h4>${msg(direction === "download" ? "dev_download_direction" : "dev_upload_direction")}</h4><p>${msg("dev_no_counted_samples")}</p></div>`;
  const values = counted.map((point) => point.bps);
  const estimate = percentile(values, SPEED_TEST_CONFIG.bandwidthPercentile);
  const position = (counted.length - 1) * SPEED_TEST_CONFIG.bandwidthPercentile;
  const highlighted = new Set([Math.floor(position), Math.ceil(position)]);
  const libraryValue =
    direction === "download" ? details?.finalDownBps : details?.finalUpBps;
  const rows = counted
    .map(
      (point, index) =>
        `<tr class="${highlighted.has(index) ? "dev-highlight" : ""}"><td>${formatNumber(index + 1, locale)}</td><td>${sizeLabel(point.bytes, locale)}</td><td>${displayValue(point.duration)} ms</td><td>${displayValue(point.bps / 1e6)} Mbps</td><td>${escapeHtml(point.measTime)}</td></tr>`,
    )
    .join("");
  const matches =
    libraryValue !== undefined &&
    Math.abs(estimate - libraryValue) / Math.max(Math.abs(libraryValue), 1) <=
      0.001;
  const comparison =
    libraryValue === undefined
      ? msg("dev_library_pending")
      : matches
        ? msg("dev_matches_library")
        : msg("dev_recomputed", {
            estimate: displayValue(estimate / 1e6),
            library: displayValue(libraryValue / 1e6),
          });
  return `<div class="dev-subsection"><h4>${msg(direction === "download" ? "dev_download_direction" : "dev_upload_direction")} · P${formatNumber(SPEED_TEST_CONFIG.bandwidthPercentile * 100, locale)}</h4><p>${msg("dev_counted_sorted", { comparison: escapeHtml(comparison) })}</p><div class="dev-data-table-wrap"><table class="dev-data-table"><thead><tr><th>#</th><th>${msg("dev_size")}</th><th>${msg("dev_duration")}</th><th>Mbps</th><th>${msg("dev_measured_at")}</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function renderPercentiles() {
  if (!details) {
    percentileContent.innerHTML = `<p>${msg("dev_percentile_prompt")}</p>`;
    return;
  }
  percentileContent.innerHTML = `${formatPercentile("download", details.download)}${formatPercentile("upload", details.upload)}`;
}

function readableMeasurement(
  measurement: (typeof SPEED_TEST_MEASUREMENTS)[number],
  index: number,
): string {
  if (measurement.type === "latency")
    return `${msg("dev_ping")} · ${msg(measurement.numPackets === 1 ? "dev_packet" : "dev_packets", { count: formatNumber(measurement.numPackets, locale) })}${index === 0 ? ` · ${msg("dev_warmup")}` : ""}`;
  const direction = msg(
    measurement.type === "download"
      ? "dev_download_direction"
      : "dev_upload_direction",
  );
  return `${direction} · ${sizeLabel(measurement.bytes, locale)} × ${formatNumber(measurement.count, locale)}${"bypassMinDuration" in measurement ? ` · ${msg("dev_warmup")}` : ""}`;
}

function renderConfig() {
  const measurements = SPEED_TEST_MEASUREMENTS.map(readableMeasurement)
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  configContent.innerHTML = `${renderPairs([
    ["Download endpoint", SPEED_TEST_CONFIG.downloadEndpoint],
    ["Upload endpoint", SPEED_TEST_CONFIG.uploadEndpoint],
    [
      "Latency percentile",
      `P${formatNumber(SPEED_TEST_CONFIG.latencyPercentile * 100, locale)}`,
    ],
    [
      "Bandwidth percentile",
      `P${formatNumber(SPEED_TEST_CONFIG.bandwidthPercentile * 100, locale)}`,
    ],
    [
      "Minimum counted duration",
      `${formatNumber(SPEED_TEST_CONFIG.bandwidthMinRequestDuration, locale)} ms`,
    ],
    [
      "Finish request duration",
      `${formatNumber(SPEED_TEST_CONFIG.bandwidthFinishRequestDuration, locale)} ms`,
    ],
    [
      "Stall timeout",
      `${formatNumber(SPEED_TEST_CONFIG.stallTimeoutMs / 1000, locale)} s`,
    ],
    ["@cloudflare/speedtest", SPEED_TEST_CONFIG.libraryVersion],
  ])}<details open><summary>${msg("dev_measurement_list", { count: formatNumber(SPEED_TEST_MEASUREMENTS.length, locale) })}</summary><ol>${measurements}</ol></details>`;
}

function renderBrowser() {
  browserContent.innerHTML = renderPairs(Object.entries(browserDetails));
}

function renderResultCard() {
  if (!isDevMode() || !hasCompletedRun) {
    resultCard.hidden = true;
    resultCard.removeAttribute("data-state");
    return;
  }

  resultCard.hidden = false;
  if (devRunActive) resultCard.dataset.state = "running";
  else resultCard.removeAttribute("data-state");

  const completedDetails = details;
  if (
    devRunActive ||
    !completedDetails ||
    completedDetails.totalDurationMs === undefined
  ) {
    resultDown.textContent = "–";
    resultUp.textContent = "–";
    resultPing.textContent = "–";
    resultJitter.textContent = "";
    resultUpBar.style.width = "0%";
    resultPingBar.style.width = "0%";
    resultPlan.innerHTML = "";
    resultUses.innerHTML = "";
    resultMeta.innerHTML = "";
    return;
  }

  const down = getSummaryValue(completedDetails, "download");
  const up = getSummaryValue(completedDetails, "upload");
  const ping = getSummaryValue(completedDetails, "latency");
  const jitter = getSummaryValue(completedDetails, "jitter");
  const downMbps = down === undefined ? undefined : down / 1e6;
  const upMbps = up === undefined ? undefined : up / 1e6;

  const formatMbps = (value: number | undefined) =>
    value === undefined
      ? "–"
      : formatNumber(value, locale, {
          maximumFractionDigits: value >= 100 ? 0 : 1,
        });
  const formatMilliseconds = (value: number | undefined) =>
    value === undefined
      ? "–"
      : formatNumber(value, locale, { maximumFractionDigits: 1 });

  resultDown.textContent = formatMbps(downMbps);
  resultUp.textContent = formatMbps(upMbps);
  resultPing.textContent = formatMilliseconds(ping);
  resultJitter.textContent =
    jitter === undefined
      ? ""
      : `· ${msg("dev_jitter")} ${formatMilliseconds(jitter)}`;
  resultUpBar.style.width =
    upMbps === undefined ? "0%" : `${gaugePosition(upMbps) * 100}%`;
  resultPingBar.style.width =
    ping === undefined ? "0%" : `${pingBarFill(ping) * 100}%`;

  const plan = loadPlan();
  const percent = planPercent(downMbps, plan.down);
  if (plan.down !== null && percent !== null) {
    const label = msg("plan_chip_long", {
      percent: formatNumber(percent, locale),
      planned: formatNumber(plan.down, locale, { maximumFractionDigits: 0 }),
    });
    resultPlan.innerHTML = `<a class="plan-chip plan-chip-${planTone(percent)}" href="/what-is-a-good-internet-speed/#less-than-plan">${escapeHtml(label)}</a>`;
  } else {
    resultPlan.innerHTML = `<button class="plan-nudge" type="button" data-dev-result-plan-nudge>${escapeHtml(msg("dev_result_set_plan"))}</button>`;
  }

  resultUses.innerHTML = devUseChecks({ downMbps, upMbps, pingMs: ping })
    .map((check) => {
      const notEnough = check.ok
        ? ""
        : `<span class="dev-result-visually-hidden">${escapeHtml(msg("dev_use_not_enough"))}</span>`;
      return `<li class="dev-use ${check.ok ? "is-ok" : "is-miss"}"><span aria-hidden="true">${check.ok ? "✓" : "–"}</span>${escapeHtml(msg(devUseMessages[check.key]))}${notEnough}</li>`;
    })
    .join("");

  const meta: string[] = [];
  if (connection?.colo && connection.colo !== "unavailable")
    meta.push(`<b>${escapeHtml(connection.colo)}</b>`);
  const location = meta.length ? meta.join(" ") : "";
  const duration = `${escapeHtml(displayValue(completedDetails.totalDurationMs / 1000))} s`;
  const requestCount =
    completedDetails.download.length +
    completedDetails.upload.length +
    completedDetails.latencyPoints.length;
  const requests = escapeHtml(
    msg("dev_result_requests", {
      count: formatNumber(requestCount, locale),
    }),
  );
  resultMeta.innerHTML = [location, duration, requests]
    .filter(Boolean)
    .map((value) => `<span>${value}</span>`)
    .join('<span class="sep" aria-hidden="true">•</span>');
}

function renderResults() {
  if (details?.totalDurationMs !== undefined) {
    hasCompletedRun = true;
    devRunActive = false;
  }
  renderSummary();
  renderLatency();
  renderRequests();
  renderPercentiles();
  syncExportButtons();
  renderResultCard();
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
  resultCopyButton.disabled = !available;
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
      renderResultCard();
    }
  }
}

connectionContent.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  if (!target.closest("[data-toggle-ip]")) return;
  showIp = !showIp;
  renderConnection();
});

let copyStatusTimer = 0;
let resultCopyRestoreTimer = 0;

async function copyRunJson() {
  const run = buildRunExport();
  if (!run) return;
  let copied = false;
  try {
    await navigator.clipboard.writeText(JSON.stringify(run, null, 2));
    copyStatus.textContent = msg("dev_copy_success");
    copied = true;
  } catch {
    copyStatus.textContent = msg("dev_copy_failed");
  }
  window.clearTimeout(copyStatusTimer);
  copyStatusTimer = window.setTimeout(() => {
    copyStatus.textContent = "";
  }, 1800);
  if (copied) {
    resultCopyButton.textContent = msg("dev_copy_success");
    window.clearTimeout(resultCopyRestoreTimer);
    resultCopyRestoreTimer = window.setTimeout(() => {
      resultCopyButton.textContent = msg("dev_copy_json");
    }, 1800);
  }
}

copyButton.addEventListener("click", () => void copyRunJson());
resultCopyButton.addEventListener("click", () => void copyRunJson());

resultCard.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  if (!target.closest("[data-dev-result-plan-nudge]")) return;
  $<HTMLButtonElement>("[data-open-settings]").click();
  $<HTMLInputElement>("#planDown").focus();
});

document.addEventListener("gts:plan-change", () => renderResultCard());

document.addEventListener("gts:testing-change", (event) => {
  if ((event as CustomEvent<boolean>).detail || !devRunActive) return;
  devRunActive = false;
  renderResultCard();
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
    if (isDevMode() && details === null) details = loadDevRun();
    renderResults();
    void loadConnectionInfo();
  } else {
    connectionRequest += 1;
    connectionLoading = false;
    hasCompletedRun = false;
    devRunActive = false;
    renderResultCard();
  }
});

document.addEventListener("gts:dev-run-start", () => {
  if (!isDevMode()) return;
  devRunActive = true;
  details = null;
  browserDetails = readBrowserDetails();
  renderBrowser();
  renderResults();
  void loadConnectionInfo();
});

document.addEventListener("gts:dev-details", (event) => {
  if (!isDevMode()) return;
  details = (event as CustomEvent<SpeedDetails>).detail;
  saveDevRun(details);
  renderResults();
});

renderConfig();
renderBrowser();
renderConnection();
if (isDevMode() && details === null) details = loadDevRun();
renderResults();
if (isDevMode()) void loadConnectionInfo();
