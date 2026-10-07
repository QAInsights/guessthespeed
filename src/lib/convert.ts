const isPositiveFinite = (value: number): boolean =>
  Number.isFinite(value) && value > 0;

export function positiveSpeed(value: number): number | null {
  return isPositiveFinite(value) ? value : null;
}

export function mbpsToMBps(mbps: number): number | null {
  if (!isPositiveFinite(mbps)) return null;
  const result = mbps / 8;
  return isPositiveFinite(result) ? result : null;
}

export function mbpsFromMBps(mBps: number): number | null {
  if (!isPositiveFinite(mBps)) return null;
  const result = mBps * 8;
  return isPositiveFinite(result) ? result : null;
}

export function downloadSeconds(
  sizeBytes: number,
  mbps: number,
  efficiency = 1,
): number | null {
  if (
    !isPositiveFinite(sizeBytes) ||
    !isPositiveFinite(mbps) ||
    !isPositiveFinite(efficiency)
  ) {
    return null;
  }

  const seconds = (sizeBytes * 8) / (mbps * 1_000_000 * efficiency);
  return isPositiveFinite(seconds) ? seconds : null;
}

export function formatDuration(seconds: number): string | null {
  if (!isPositiveFinite(seconds)) return null;

  const totalSeconds = Math.max(1, Math.round(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainder = totalSeconds % 60;
  const parts: string[] = [];

  if (hours) parts.push(`${hours} hr`);
  if (minutes) parts.push(`${minutes} min`);
  if (remainder || parts.length === 0) {
    parts.push(`${remainder || 1} s`);
  }

  return parts.join(" ");
}
