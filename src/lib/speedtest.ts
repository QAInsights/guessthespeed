import SpeedTest from "@cloudflare/speedtest";

export type Phase = "ping" | "down" | "up";

export interface LiveUpdate {
  phase: Phase;
  mbps?: number;
  pingMs?: number;
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

async function runMock(
  onUpdate: (update: LiveUpdate) => void,
): Promise<SpeedResult> {
  const ping = 9 + Math.random() * 27;
  onUpdate({ phase: "ping", pingMs: ping });
  await delay(650);
  const down = 42 + Math.random() * 440;
  for (let i = 1; i <= 27; i += 1) {
    await delay(100);
    onUpdate({ phase: "down", mbps: down * (1 - Math.pow(1 - i / 27, 2)) });
  }
  const up = Math.max(8, down * (0.12 + Math.random() * 0.28));
  for (let i = 1; i <= 27; i += 1) {
    await delay(100);
    onUpdate({ phase: "up", mbps: up * (1 - Math.pow(1 - i / 27, 2)) });
  }
  return { down, up, ping, jitter: 1 + Math.random() * 4 };
}

export function runSpeedTest(
  onUpdate: (update: LiveUpdate) => void,
): Promise<SpeedResult> {
  if (
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("mock") === "1"
  ) {
    return runMock(onUpdate);
  }

  return new Promise((resolve, reject) => {
    const test = new SpeedTest({
      autoStart: false,
      measureDownloadLoadedLatency: false,
      measureUploadLoadedLatency: false,
      measurements,
    });
    test.onResultsChange = ({ type }) => {
      if (type === "latency") {
        const pingMs = test.results.getUnloadedLatency();
        if (Number.isFinite(pingMs)) onUpdate({ phase: "ping", pingMs });
      } else if (type === "download") {
        const points = test.results.getDownloadBandwidthPoints();
        const last = points.at(-1);
        const mbps = last ? last.bps / 1e6 : Number.NaN;
        if (Number.isFinite(mbps)) onUpdate({ phase: "down", mbps });
      } else if (type === "upload") {
        const points = test.results.getUploadBandwidthPoints();
        const last = points.at(-1);
        const mbps = last ? last.bps / 1e6 : Number.NaN;
        if (Number.isFinite(mbps)) onUpdate({ phase: "up", mbps });
      }
    };
    test.onFinish = (results) => {
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
        reject(new Error("The speed test did not return complete results."));
        return;
      }
      resolve({
        down: downloadBps / 1e6,
        up: uploadBps / 1e6,
        ping,
        jitter:
          typeof jitter === "number" && Number.isFinite(jitter) ? jitter : null,
      });
    };
    test.onError = (error) => reject(new Error(error));
    test.play();
  });
}
