import { describe, expect, it } from "vitest";
import type { SpeedDetails } from "./speedtest";
import { DEV_RUN_KEY, loadDevRun, saveDevRun } from "./devrun";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const run: SpeedDetails = {
  startedAt: 1_700_000_000_000,
  totalDurationMs: 12_345,
  latencyPoints: [12.4, 13.1],
  download: [],
  upload: [],
  summary: {} as SpeedDetails["summary"],
};

describe("Dev run session storage", () => {
  it("round-trips a completed run", () => {
    const storage = new MemoryStorage();

    saveDevRun(run, storage);

    expect(storage.getItem(DEV_RUN_KEY)).not.toBeNull();
    expect(loadDevRun(storage)).toEqual(run);
  });

  it("does not save an incomplete run", () => {
    const storage = new MemoryStorage();

    saveDevRun({ ...run, totalDurationMs: undefined }, storage);

    expect(storage.getItem(DEV_RUN_KEY)).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    const storage = new MemoryStorage();
    storage.setItem(DEV_RUN_KEY, "{");

    expect(loadDevRun(storage)).toBeNull();
  });

  it("returns null for an invalid shape", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      DEV_RUN_KEY,
      JSON.stringify({
        startedAt: run.startedAt,
        totalDurationMs: run.totalDurationMs,
        latencyPoints: [],
        download: [],
        upload: [],
        summary: [],
      }),
    );

    expect(loadDevRun(storage)).toBeNull();
  });

  it("swallows storage write and read errors", () => {
    const throwingStorage = {
      getItem() {
        throw new Error("private storage");
      },
      setItem() {
        throw new Error("quota exceeded");
      },
    };

    expect(() => saveDevRun(run, throwingStorage)).not.toThrow();
    expect(() => loadDevRun(throwingStorage)).not.toThrow();
    expect(loadDevRun(throwingStorage)).toBeNull();
  });
});
