import { isRecord } from "./guards";
import type { SpeedDetails } from "./speedtest";

export const DEV_RUN_KEY = "gts:dev-last-run";

type DevRunStorage = Pick<Storage, "getItem" | "setItem">;

function getStorage(storage?: DevRunStorage): DevRunStorage | undefined {
  try {
    return storage ?? sessionStorage;
  } catch {
    return undefined;
  }
}

export function saveDevRun(
  details: SpeedDetails,
  storage?: DevRunStorage,
): void {
  if (
    typeof details.totalDurationMs !== "number" ||
    !Number.isFinite(details.totalDurationMs)
  )
    return;

  const target = getStorage(storage);
  if (!target) return;

  try {
    const serialized = JSON.stringify(details);
    if (serialized !== undefined) target.setItem(DEV_RUN_KEY, serialized);
  } catch {
    return;
  }
}

export function loadDevRun(storage?: DevRunStorage): SpeedDetails | null {
  const target = getStorage(storage);
  if (!target) return null;

  try {
    const serialized = target.getItem(DEV_RUN_KEY);
    if (!serialized) return null;

    const parsed: unknown = JSON.parse(serialized);
    if (
      !isRecord(parsed) ||
      typeof parsed.startedAt !== "number" ||
      !Number.isFinite(parsed.startedAt) ||
      typeof parsed.totalDurationMs !== "number" ||
      !Number.isFinite(parsed.totalDurationMs) ||
      !Array.isArray(parsed.latencyPoints) ||
      !Array.isArray(parsed.download) ||
      !Array.isArray(parsed.upload) ||
      !isRecord(parsed.summary)
    )
      return null;

    return parsed as unknown as SpeedDetails;
  } catch {
    return null;
  }
}
