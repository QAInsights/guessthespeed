export type DevUse = "streaming4k" | "videoCalls" | "gaming" | "bigUploads";

export interface DevUseCheck {
  key: DevUse;
  ok: boolean;
}

export const DEV_USE_THRESHOLDS = {
  streaming4kDownMbps: 25,
  videoCallsUpMbps: 3,
  gamingMaxPingMs: 50,
  bigUploadsUpMbps: 20,
} as const;

export function devUseChecks(r: {
  downMbps?: number;
  upMbps?: number;
  pingMs?: number;
}): DevUseCheck[] {
  const checks: DevUseCheck[] = [];
  const { downMbps, upMbps, pingMs } = r;
  if (typeof downMbps === "number" && Number.isFinite(downMbps)) {
    checks.push({
      key: "streaming4k",
      ok: downMbps >= DEV_USE_THRESHOLDS.streaming4kDownMbps,
    });
  }
  if (typeof upMbps === "number" && Number.isFinite(upMbps)) {
    checks.push({
      key: "videoCalls",
      ok: upMbps >= DEV_USE_THRESHOLDS.videoCallsUpMbps,
    });
  }
  if (typeof pingMs === "number" && Number.isFinite(pingMs)) {
    checks.push({
      key: "gaming",
      ok: pingMs < DEV_USE_THRESHOLDS.gamingMaxPingMs,
    });
  }
  if (typeof upMbps === "number" && Number.isFinite(upMbps)) {
    checks.push({
      key: "bigUploads",
      ok: upMbps >= DEV_USE_THRESHOLDS.bigUploadsUpMbps,
    });
  }
  return checks;
}

export function pingBarFill(pingMs: number): number {
  return Math.min(1, Math.max(0.04, 1 - pingMs / 150));
}
