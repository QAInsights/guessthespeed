import { describe, expect, it } from "vitest";
import { phaseText, sizeLabel, type Phase } from "./progress";

describe("sizeLabel", () => {
  it.each([
    [1e5, "100 kB"],
    [1e6, "1 MB"],
    [1e7, "10 MB"],
    [2.5e7, "25 MB"],
    [5e7, "50 MB"],
    [1e8, "100 MB"],
  ])("formats %i bytes", (bytes, expected) => {
    expect(sizeLabel(bytes)).toBe(expected);
  });
});

describe("phaseText", () => {
  it.each([
    ["ping", undefined, { phase: "ping" }],
    ["ping", 1e5, { phase: "ping", bytes: 1e5 }],
    ["down", undefined, { phase: "down" }],
    ["down", 1e7, { phase: "down", bytes: 1e7 }],
    ["up", undefined, { phase: "up" }],
    ["up", 2.5e7, { phase: "up", bytes: 2.5e7 }],
  ] as [Phase, number | undefined, { phase: Phase; bytes?: number }][])(
    "returns data for the %s phase",
    (phase, bytes, expected) => {
      expect(phaseText(phase, bytes)).toEqual(expected);
    },
  );
});
