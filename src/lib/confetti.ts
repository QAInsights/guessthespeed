export interface ConfettiPiece {
  x: number;
  drift: number;
  delayMs: number;
  durationMs: number;
  rotate: number;
  size: number;
  color?: string;
  emoji?: string;
  shape: "rect" | "circle";
}

export function confettiPieces(
  count: number,
  colors: string[],
  emoji: string[],
  random: () => number = Math.random,
): ConfettiPiece[] {
  const total = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  return Array.from({ length: total }, (_, index) => {
    const piece: ConfettiPiece = {
      x: random() * 100,
      drift: random() * 60 - 30,
      delayMs: random() * 400,
      durationMs: 2400 + random() * 1000,
      rotate: 360 + random() * 720,
      size: 6 + random() * 6,
      shape: random() < 0.5 ? "rect" : "circle",
    };
    if (colors.length) piece.color = colors[index % colors.length];
    if (index < 6 && emoji.length) piece.emoji = emoji[index % emoji.length];
    return piece;
  });
}
