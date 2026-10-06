import SpeedTest from "@cloudflare/speedtest";
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

const measurements = [
  { type: "latency" as const, numPackets: 1 },
  { type: "download" as const, bytes: 1e5, count: 1, bypassMinDuration: true },
  { type: "latency" as const, numPackets: 20 },
  { type: "download" as const, bytes: 1e5, count: 9 },
  { type: "download" as const, bytes: 1e6, count: 8 },
  { type: "download" as const, bytes: 1e7, count: 6 },
  { type: "download" as const, bytes: 2.5e7, count: 4 },
  { type: "download" as const, bytes: 1e8, count: 3 },
  { type: "upload" as const, bytes: 1e5, count: 8 },
  { type: "upload" as const, bytes: 1e6, count: 6 },
  { type: "upload" as const, bytes: 1e7, count: 4 },
  { type: "upload" as const, bytes: 2.5e7, count: 4 },
  { type: "upload" as const, bytes: 5e7, count: 3 },
];

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
): Promise<SpeedResult> {
  const ping = 9 + Math.random() * 27;
  onUpdate({
    phase: "ping",
    step: 1,
    steps: measurements.length,
    pingMs: ping,
  });
  await delay(650);
  const down = 42 + Math.random() * 440;
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
    if (mode === "stall" && i === 4) await new Promise<SpeedResult>(() => {});
  }
  const up = Math.max(8, down * (0.12 + Math.random() * 0.28));
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
  }
  return { down, up, ping, jitter: 1 + Math.random() * 4 };
}

export function runSpeedTest(
  onUpdate: (update: LiveUpdate) => void,
): Promise<SpeedResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let lastActivity = Date.now();
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
      void runMock(emit, mockMode).then(
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
