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
    ["ping", undefined, "Pinging Cloudflare"],
    ["ping", 1e5, "Pinging Cloudflare"],
    ["down", undefined, "Measuring download"],
    ["down", 1e7, "Measuring download: 10 MB files"],
    ["up", undefined, "Measuring upload"],
    ["up", 2.5e7, "Measuring upload: 25 MB files"],
  ] as [Phase, number | undefined, string][])(
    "formats the %s phase",
    (phase, bytes, expected) => {
      expect(phaseText(phase, bytes)).toBe(expected);
    },
  );
});
