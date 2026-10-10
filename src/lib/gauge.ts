export function gaugePosition(value: number): number {
  const ticks = [0, 5, 10, 25, 50, 100, 250, 500, 1000];
  if (value <= 0) return 0;
  if (value >= 1000) return 1;
  let segment = 0;
  while (ticks[segment + 1] < value) segment += 1;
  return (
    (segment +
      (value - ticks[segment]) / (ticks[segment + 1] - ticks[segment])) /
    (ticks.length - 1)
  );
}
