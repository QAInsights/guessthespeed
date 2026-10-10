import { describe, expect, it } from "vitest";
import { devUseChecks, pingBarFill } from "./devresult";
import { gaugePosition } from "./gauge";

describe("gaugePosition", () => {
  it("maps zero to the start of the gauge", () => {
    expect(gaugePosition(0)).toBe(0);
  });

  it("maps 25 Mbps to three eighths", () => {
    expect(gaugePosition(25)).toBe(3 / 8);
  });

  it("caps values at 1000 Mbps", () => {
    expect(gaugePosition(1000)).toBe(1);
    expect(gaugePosition(1500)).toBe(1);
  });

  it("maps 750 Mbps between seven eighths and one", () => {
    expect(gaugePosition(750)).toBeGreaterThan(7 / 8);
    expect(gaugePosition(750)).toBeLessThan(1);
  });
});

describe("devUseChecks", () => {
  it("checks download and upload thresholds inclusively", () => {
    expect(devUseChecks({ downMbps: 25, upMbps: 3, pingMs: 49 })).toEqual([
      { key: "streaming4k", ok: true },
      { key: "videoCalls", ok: true },
      { key: "gaming", ok: true },
      { key: "bigUploads", ok: false },
    ]);
    expect(devUseChecks({ downMbps: 24.9 })).toEqual([
      { key: "streaming4k", ok: false },
    ]);
    expect(devUseChecks({ upMbps: 2.9 })).toEqual([
      { key: "videoCalls", ok: false },
      { key: "bigUploads", ok: false },
    ]);
    expect(devUseChecks({ upMbps: 20 })).toEqual([
      { key: "videoCalls", ok: true },
      { key: "bigUploads", ok: true },
    ]);
    expect(devUseChecks({ upMbps: 19.9 })).toEqual([
      { key: "videoCalls", ok: true },
      { key: "bigUploads", ok: false },
    ]);
  });

  it("requires ping below 50 ms for gaming", () => {
    expect(devUseChecks({ pingMs: 49.9 })).toEqual([
      { key: "gaming", ok: true },
    ]);
    expect(devUseChecks({ pingMs: 50 })).toEqual([
      { key: "gaming", ok: false },
    ]);
  });

  it("omits checks for missing or non-finite measurements", () => {
    expect(devUseChecks({})).toEqual([]);
    expect(
      devUseChecks({
        downMbps: Number.NaN,
        upMbps: Number.POSITIVE_INFINITY,
        pingMs: Number.NEGATIVE_INFINITY,
      }),
    ).toEqual([]);
  });
});

describe("pingBarFill", () => {
  it("clamps ping into the visible bar range", () => {
    expect(pingBarFill(0)).toBe(1);
    expect(pingBarFill(7)).toBeCloseTo(0.953, 2);
    expect(pingBarFill(150)).toBe(0.04);
    expect(pingBarFill(500)).toBe(0.04);
  });
});
