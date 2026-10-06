import SpeedTest, {
  type BandwidthPoint,
  type MeasurementSummary,
  type Scores,
} from "@cloudflare/speedtest";
import { countedSamples, percentile } from "./devdata";
import { STALL_TIMEOUT_MS, type Phase } from "./progress";

export type { Phase } from "./progress";

export interface LiveUpdate {
  phase: Phase;
  mbps?: number;
  pingMs?: number;
  step?: number;
  steps?: number;
  bytes?: number;
}

export interface SpeedResult {
  down: number;
  up: number;
  ping: number;
  jitter: number | null;
}

export type SerializableBandwidthPoint = Omit<BandwidthPoint, "measTime"> & {
  measTime: string;
};

export interface SpeedDetails {
  startedAt: number;
  totalDurationMs?: number;
  latencyPoints: number[];
  download: SerializableBandwidthPoint[];
  upload: SerializableBandwidthPoint[];
  summary: MeasurementSummary;
  scores?: Scores;
  finalDownBps?: number;
  finalUpBps?: number;
}

export interface SpeedTestOptions {
  onDetails?: (details: SpeedDetails) => void;
}

export const SPEED_TEST_MEASUREMENTS = [
  { type: "latency", numPackets: 1 },
  { type: "download", bytes: 1e5, count: 1, bypassMinDuration: true },
  { type: "latency", numPackets: 20 },
  { type: "download", bytes: 1e5, count: 9 },
  { type: "download", bytes: 1e6, count: 8 },
  { type: "download", bytes: 1e7, count: 6 },
  { type: "download", bytes: 2.5e7, count: 4 },
  { type: "download", bytes: 1e8, count: 3 },
  { type: "upload", bytes: 1e5, count: 8 },
  { type: "upload", bytes: 1e6, count: 6 },
  { type: "upload", bytes: 1e7, count: 4 },
  { type: "upload", bytes: 2.5e7, count: 4 },
  { type: "upload", bytes: 5e7, count: 3 },
] as const;

export const SPEED_TEST_CONFIG = {
  downloadEndpoint: "https://speed.cloudflare.com/__down",
  uploadEndpoint: "https://speed.cloudflare.com/__up",
  latencyPercentile: 0.5,
  bandwidthPercentile: 0.9,
  bandwidthMinRequestDuration: 10,
  bandwidthFinishRequestDuration: 1000,
  stallTimeoutMs: STALL_TIMEOUT_MS,
  libraryVersion: "1.14.1",
};

const measurements = SPEED_TEST_MEASUREMENTS.map((measurement) => ({
  ...measurement,
}));

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class StalledError extends Error {
  constructor() {
    super("The speed test stopped producing data.");
    this.name = "StalledError";
  }
}

const downloadSteps = [
  { step: 2, bytes: 1e5 },
  { step: 4, bytes: 1e5 },
  { step: 5, bytes: 1e6 },
  { step: 6, bytes: 1e7 },
  { step: 7, bytes: 2.5e7 },
  { step: 8, bytes: 1e8 },
];

const uploadSteps = [
  { step: 9, bytes: 1e5 },
  { step: 10, bytes: 1e6 },
  { step: 11, bytes: 1e7 },
  { step: 12, bytes: 2.5e7 },
  { step: 13, bytes: 5e7 },
];

async function runMock(
  onUpdate: (update: LiveUpdate) => void,
  mode: "1" | "slow" | "stall",
  onDetails: SpeedTestOptions["onDetails"],
  startedAt: number,
): Promise<SpeedResult> {
  const ping = 9 + Math.random() * 27;
  const latencyPoints = [
    ping,
    ping + Math.random() * 2,
    ping - Math.random() * 1.5,
    ping + Math.random() * 3,
    ping + Math.random() * 1.2,
  ];
  const jitter =
    latencyPoints.reduce((sum, value, index) => {
      const previous = latencyPoints[index - 1] ?? value;
      return index === 0 ? sum : sum + Math.abs(value - previous);
    }, 0) /
    (latencyPoints.length - 1);
  const download: SerializableBandwidthPoint[] = [];
  const upload: SerializableBandwidthPoint[] = [];
  const down = 42 + Math.random() * 440;
  const up = Math.max(8, down * (0.12 + Math.random() * 0.28));
  const emitDetails = (finished = false) => {
    const countedDown = countedSamples(
      download,
      SPEED_TEST_CONFIG.bandwidthMinRequestDuration,
    );
    const countedUp = countedSamples(
      upload,
      SPEED_TEST_CONFIG.bandwidthMinRequestDuration,
    );
    const finalDownBps = countedDown.length
      ? percentile(
          countedDown.map((point) => point.bps),
          SPEED_TEST_CONFIG.bandwidthPercentile,
        )
      : undefined;
    const finalUpBps = countedUp.length
      ? percentile(
          countedUp.map((point) => point.bps),
          SPEED_TEST_CONFIG.bandwidthPercentile,
        )
      : undefined;
    const summary: MeasurementSummary = {
      ...(finalDownBps === undefined ? {} : { download: finalDownBps }),
      ...(finalUpBps === undefined ? {} : { upload: finalUpBps }),
      latency: percentile(latencyPoints, SPEED_TEST_CONFIG.latencyPercentile),
      jitter,
      ...(finished ? { totalDurationMs: Date.now() - startedAt } : {}),
    };
    const details: SpeedDetails = {
      startedAt,
      ...(finished ? { totalDurationMs: Date.now() - startedAt } : {}),
      latencyPoints: [...latencyPoints],
      download: [...download],
      upload: [...upload],
      summary,
      ...(finalDownBps === undefined ? {} : { finalDownBps }),
      ...(finalUpBps === undefined ? {} : { finalUpBps }),
      ...(finished
        ? {
            scores: {
              streaming: {
                points: 3,
                classificationIdx: 3,
                classificationName: "good" as const,
              },
              gaming: {
                points: 2,
                classificationIdx: 2,
                classificationName: "average" as const,
              },
              rtc: {
                points: 3,
                classificationIdx: 3,
                classificationName: "good" as const,
              },
            },
          }
        : {}),
    };
    onDetails?.(details);
  };

  const addPoint = (
    direction: "down" | "up",
    bytes: number,
    mbps: number,
    index: number,
  ) => {
    const bps = mbps * 1e6 * (0.92 + Math.random() * 0.16);
    const duration = Math.max(10, (bytes * 8 * 1000) / bps);
    const points = direction === "down" ? download : upload;
    points.push({
      bytes,
      bps,
      duration,
      ping: latencyPoints[index % latencyPoints.length],
      measTime: new Date().toISOString(),
      serverTime: index % 6 === 0 ? -1 : 3 + Math.random() * 8,
      transferSize: bytes + 450,
    });
    emitDetails();
  };

  onUpdate({
    phase: "ping",
    step: 1,
    steps: measurements.length,
    pingMs: ping,
  });
  emitDetails();
  await delay(650);
  let lastDownloadStep = -1;
  for (let i = 1; i <= 27; i += 1) {
    const stepIndex = Math.min(
      Math.floor(((i - 1) * downloadSteps.length) / 27),
      downloadSteps.length - 1,
    );
    const current = downloadSteps[stepIndex];
    if (stepIndex !== lastDownloadStep) {
      onUpdate({
        phase: "down",
        step: current.step,
        steps: measurements.length,
        bytes: current.bytes,
      });
      lastDownloadStep = stepIndex;
    }
    if (mode === "slow" && i === 14) await delay(10000);
    await delay(100);
    onUpdate({
      phase: "down",
      step: current.step,
      steps: measurements.length,
      bytes: current.bytes,
      mbps: down * (1 - Math.pow(1 - i / 27, 2)),
    });
    addPoint("down", current.bytes, down * (1 - Math.pow(1 - i / 27, 2)), i);
    if (mode === "stall" && i === 4) await new Promise<SpeedResult>(() => {});
  }
  let lastUploadStep = -1;
  for (let i = 1; i <= 27; i += 1) {
    const stepIndex = Math.min(
      Math.floor(((i - 1) * uploadSteps.length) / 27),
      uploadSteps.length - 1,
    );
    const current = uploadSteps[stepIndex];
    if (stepIndex !== lastUploadStep) {
      onUpdate({
        phase: "up",
        step: current.step,
        steps: measurements.length,
        bytes: current.bytes,
      });
      lastUploadStep = stepIndex;
    }
    await delay(100);
    onUpdate({
      phase: "up",
      step: current.step,
      steps: measurements.length,
      bytes: current.bytes,
      mbps: up * (1 - Math.pow(1 - i / 27, 2)),
    });
    addPoint("up", current.bytes, up * (1 - Math.pow(1 - i / 27, 2)), i);
  }
  emitDetails(true);
  return { down, up, ping, jitter };
}

export function runSpeedTest(
  onUpdate: (update: LiveUpdate) => void,
  options: SpeedTestOptions = {},
): Promise<SpeedResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let lastActivity = Date.now();
    const startedAt = lastActivity;
    let test: SpeedTest | undefined;
    let watchdog: ReturnType<typeof setInterval>;

    const clearWatchdog = () => clearInterval(watchdog);
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearWatchdog();
      callback();
    };
    const touch = () => {
      if (!settled) lastActivity = Date.now();
    };
    const emit = (update: LiveUpdate) => {
      if (settled) return;
      touch();
      onUpdate(update);
    };

    watchdog = setInterval(() => {
      if (settled || Date.now() - lastActivity < STALL_TIMEOUT_MS) return;
      settled = true;
      clearWatchdog();
      try {
        test?.pause();
      } finally {
        reject(new StalledError());
      }
    }, 1000);

    const mockMode =
      typeof window === "undefined"
        ? null
        : new URLSearchParams(window.location.search).get("mock");
    if (mockMode === "1" || mockMode === "slow" || mockMode === "stall") {
      void runMock(emit, mockMode, options.onDetails, startedAt).then(
        (result) => settle(() => resolve(result)),
        (error: unknown) =>
          settle(() =>
            reject(error instanceof Error ? error : new Error(String(error))),
          ),
      );
      return;
    }

    try {
      test = new SpeedTest({
        autoStart: false,
        measureDownloadLoadedLatency: false,
        measureUploadLoadedLatency: false,
        measurements,
        latencyPercentile: SPEED_TEST_CONFIG.latencyPercentile,
        bandwidthPercentile: SPEED_TEST_CONFIG.bandwidthPercentile,
        bandwidthMinRequestDuration:
          SPEED_TEST_CONFIG.bandwidthMinRequestDuration,
        bandwidthFinishRequestDuration:
          SPEED_TEST_CONFIG.bandwidthFinishRequestDuration,
      });
    } catch (error) {
      settle(() =>
        reject(error instanceof Error ? error : new Error(String(error))),
      );
      return;
    }
    test.onPhaseChange = ({ measurementId, measurement }) => {
      touch();
      const phase =
        measurement.type === "latency"
          ? "ping"
          : measurement.type === "download"
            ? "down"
            : "up";
      emit({
        phase,
        step: measurementId + 1,
        steps: measurements.length,
        bytes: "bytes" in measurement ? measurement.bytes : undefined,
      });
    };
    test.onResultsChange = ({ type }) => {
      touch();
      if (settled) return;
      if (type === "latency") {
        const pingMs = test!.results.getUnloadedLatency();
        if (Number.isFinite(pingMs)) emit({ phase: "ping", pingMs });
      } else if (type === "download") {
        const points = test!.results.getDownloadBandwidthPoints();
        const last = points.at(-1);
        const mbps = last ? last.bps / 1e6 : Number.NaN;
        if (Number.isFinite(mbps)) emit({ phase: "down", mbps });
      } else if (type === "upload") {
        const points = test!.results.getUploadBandwidthPoints();
        const last = points.at(-1);
        const mbps = last ? last.bps / 1e6 : Number.NaN;
        if (Number.isFinite(mbps)) emit({ phase: "up", mbps });
      }
      if (options.onDetails) {
        const results = test!.results;
        const serializePoint = (
          point: BandwidthPoint,
        ): SerializableBandwidthPoint => ({
          ...point,
          measTime: point.measTime.toISOString(),
        });
        options.onDetails({
          startedAt,
          ...(results.getTotalDurationMs() === undefined
            ? {}
            : { totalDurationMs: results.getTotalDurationMs() }),
          latencyPoints: results.getUnloadedLatencyPoints(),
          download: results.getDownloadBandwidthPoints().map(serializePoint),
          upload: results.getUploadBandwidthPoints().map(serializePoint),
          summary: results.getSummary(),
          scores: results.getScores(),
          ...(results.getDownloadBandwidth() === undefined
            ? {}
            : { finalDownBps: results.getDownloadBandwidth() }),
          ...(results.getUploadBandwidth() === undefined
            ? {}
            : { finalUpBps: results.getUploadBandwidth() }),
        });
      }
    };
    test.onFinish = (results) => {
      if (settled) return;
      const downloadBps = results.getDownloadBandwidth();
      const uploadBps = results.getUploadBandwidth();
      const ping = results.getUnloadedLatency();
      const jitter = results.getUnloadedJitter();
      if (
        typeof downloadBps !== "number" ||
        typeof uploadBps !== "number" ||
        typeof ping !== "number" ||
        ![downloadBps, uploadBps, ping].every(Number.isFinite)
      ) {
        settle(() =>
          reject(new Error("The speed test did not return complete results.")),
        );
        return;
      }
      if (options.onDetails) {
        const serializePoint = (
          point: BandwidthPoint,
        ): SerializableBandwidthPoint => ({
          ...point,
          measTime: point.measTime.toISOString(),
        });
        options.onDetails({
          startedAt,
          ...(results.getTotalDurationMs() === undefined
            ? {}
            : { totalDurationMs: results.getTotalDurationMs() }),
          latencyPoints: results.getUnloadedLatencyPoints(),
          download: results.getDownloadBandwidthPoints().map(serializePoint),
          upload: results.getUploadBandwidthPoints().map(serializePoint),
          summary: results.getSummary(),
          scores: results.getScores(),
          finalDownBps: downloadBps,
          finalUpBps: uploadBps,
        });
      }
      settle(() =>
        resolve({
          down: downloadBps / 1e6,
          up: uploadBps / 1e6,
          ping,
          jitter:
            typeof jitter === "number" && Number.isFinite(jitter)
              ? jitter
              : null,
        }),
      );
    };
    test.onError = (error) => {
      if (settled) return;
      settle(() => reject(new Error(error)));
    };
    try {
      test.play();
    } catch (error) {
      settle(() =>
        reject(error instanceof Error ? error : new Error(String(error))),
      );
    }
  });
}
