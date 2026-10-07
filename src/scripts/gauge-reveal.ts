export const REVEAL_SWING_MS = 1600;
export const REVEAL_SUSPENSE_MS = 1200;

export function revealProgress(elapsedMs: number, target: number): number {
  if (target <= 0) return 0;
  if (elapsedMs >= REVEAL_SWING_MS) return target;

  const t = Math.max(0, elapsedMs) / 1000;
  const progress =
    target * (1 - Math.exp(-t / 0.3) * Math.cos(2 * Math.PI * 1.4 * t));
  return Math.min(1.03, Math.max(0, progress));
}
