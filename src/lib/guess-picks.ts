export const GUESS_PICKS = {
  down: [
    { label: "guess_pick_slow", value: 25 },
    { label: "guess_pick_ok", value: 100 },
    { label: "guess_pick_fast", value: 300 },
    { label: "guess_pick_super_fast", value: 1000 },
  ],
  up: [
    { label: "guess_pick_slow", value: 5 },
    { label: "guess_pick_ok", value: 20 },
    { label: "guess_pick_fast", value: 100 },
    { label: "guess_pick_super_fast", value: 500 },
  ],
} as const;

export type GuessDirection = keyof typeof GUESS_PICKS;

export function stepGuess(
  currentValue: number | string,
  direction: -1 | 1,
): number {
  const parsed =
    typeof currentValue === "number"
      ? currentValue
      : currentValue.trim() === ""
        ? 0
        : Number(currentValue);
  const value = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  const step = value < 50 ? 5 : value < 200 ? 10 : value < 1000 ? 50 : 100;
  return Math.max(0, value + direction * step);
}
