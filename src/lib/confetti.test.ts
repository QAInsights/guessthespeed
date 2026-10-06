import { describe, expect, it } from "vitest";
import { confettiPieces } from "./confetti";

function seededRandom(): () => number {
  let value = 0x12345678;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

describe("confetti pieces", () => {
  it("creates the requested number of pieces and cycles through colors", () => {
    const colors = ["#ff5a36", "#92dcff", "#ffd166"];
    const pieces = confettiPieces(8, colors, [], seededRandom());

    expect(pieces).toHaveLength(8);
    expect(pieces.map((piece) => piece.color)).toEqual([
      ...colors,
      ...colors,
      "#ff5a36",
      "#92dcff",
    ]);
  });

  it("caps emoji pieces at six", () => {
    const pieces = confettiPieces(
      20,
      ["#ff5a36"],
      ["🎉", "⭐", "🎈", "🎊", "🥳", "🎁", "✨"],
      seededRandom(),
    );

    expect(pieces.filter((piece) => piece.emoji)).toHaveLength(6);
  });

  it("keeps every generated value within its range", () => {
    const pieces = confettiPieces(70, ["#ff5a36"], [], seededRandom());

    for (const piece of pieces) {
      expect(piece.x).toBeGreaterThanOrEqual(0);
      expect(piece.x).toBeLessThanOrEqual(100);
      expect(piece.drift).toBeGreaterThanOrEqual(-30);
      expect(piece.drift).toBeLessThanOrEqual(30);
      expect(piece.delayMs).toBeGreaterThanOrEqual(0);
      expect(piece.delayMs).toBeLessThanOrEqual(400);
      expect(piece.durationMs).toBeGreaterThanOrEqual(2400);
      expect(piece.durationMs).toBeLessThanOrEqual(3400);
      expect(piece.rotate).toBeGreaterThanOrEqual(360);
      expect(piece.rotate).toBeLessThanOrEqual(1080);
      expect(piece.size).toBeGreaterThanOrEqual(6);
      expect(piece.size).toBeLessThanOrEqual(12);
      expect(["rect", "circle"]).toContain(piece.shape);
    }
  });

  it("returns no pieces for a zero count", () => {
    expect(confettiPieces(0, ["#ff5a36"], ["🎉"], seededRandom())).toEqual([]);
  });
});
