export interface SpeedSample {
  at: number;
  down: number;
  up: number;
  ping: number;
}

export const HISTORY_KEY = "gts:speed-history";
export const HISTORY_MAX = 10;

export function parseHistory(raw: unknown): SpeedSample[] {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (sample): sample is SpeedSample =>
        typeof sample === "object" &&
        sample !== null &&
        "at" in sample &&
        "down" in sample &&
        "up" in sample &&
        "ping" in sample &&
        typeof sample.at === "number" &&
        Number.isFinite(sample.at) &&
        sample.at > 0 &&
        Number.isFinite(new Date(sample.at).getTime()) &&
        typeof sample.down === "number" &&
        Number.isFinite(sample.down) &&
        sample.down > 0 &&
        typeof sample.up === "number" &&
        Number.isFinite(sample.up) &&
        sample.up > 0 &&
        typeof sample.ping === "number" &&
        Number.isFinite(sample.ping) &&
        sample.ping >= 0,
    )
    .sort((a, b) => a.at - b.at)
    .slice(-HISTORY_MAX);
}

export function addSample(
  list: SpeedSample[],
  sample: SpeedSample,
): SpeedSample[] {
  return [...list, sample].slice(-HISTORY_MAX);
}

export function compareLatest(list: SpeedSample[]): {
  delta: number;
  direction: "faster" | "slower" | "same";
} | null {
  if (list.length < 2) return null;
  const sorted = [...list].sort((a, b) => a.at - b.at);
  const previous = sorted.at(-2)!;
  const latest = sorted.at(-1)!;
  const roundedDelta = Math.round(latest.down - previous.down);
  const delta = roundedDelta === 0 ? 0 : roundedDelta;
  return {
    delta,
    direction: delta === 0 ? "same" : delta > 0 ? "faster" : "slower",
  };
}
