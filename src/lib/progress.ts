export type Phase = "ping" | "down" | "up";

export const SLOW_HINT_MS = 6000;
export const STALL_TIMEOUT_MS = 45000;

export function sizeLabel(bytes: number): string {
  const kilobytes = bytes < 1e6;
  const amount = kilobytes ? bytes / 1e3 : bytes / 1e6;
  const value = Number.isInteger(amount) ? amount.toFixed(0) : String(amount);
  return `${value} ${kilobytes ? "kB" : "MB"}`;
}

export function phaseText(phase: Phase, bytes?: number): string {
  if (phase === "ping") return "Pinging Cloudflare";
  const stage = phase === "down" ? "Measuring download" : "Measuring upload";
  return bytes === undefined ? stage : `${stage}: ${sizeLabel(bytes)} files`;
}
