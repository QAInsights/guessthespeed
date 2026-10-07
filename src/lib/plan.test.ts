import { describe, expect, it } from "vitest";
import {
  formatPlanChip,
  formatPlanChipShort,
  hasPlan,
  loadPlan,
  parsePlan,
  PLAN_KEY,
  planPercent,
  planTone,
  savePlan,
  type PlanStorageLike,
} from "./plan";

const emptyPlan = { down: null, up: null };

function memoryStorage(initial?: Record<string, string>): PlanStorageLike {
  const values = new Map(Object.entries(initial ?? {}));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

describe("parsePlan", () => {
  it("returns an empty plan for garbage and non-record input", () => {
    expect(parsePlan("{")).toEqual(emptyPlan);
    expect(parsePlan(null)).toEqual(emptyPlan);
    expect(parsePlan([])).toEqual(emptyPlan);
    expect(parsePlan(42)).toEqual(emptyPlan);
  });

  it("keeps only finite numeric speeds from 1 through 10000", () => {
    expect(
      parsePlan({
        down: 500,
        up: 50,
      }),
    ).toEqual({ down: 500, up: 50 });
    expect(
      parsePlan({
        down: -1,
        up: 0,
      }),
    ).toEqual(emptyPlan);
    expect(
      parsePlan({
        down: 10001,
        up: "50",
      }),
    ).toEqual(emptyPlan);
    expect(
      parsePlan({
        down: Number.POSITIVE_INFINITY,
        up: Number.NaN,
      }),
    ).toEqual(emptyPlan);
  });

  it("parses JSON and validates each field independently", () => {
    expect(parsePlan('{"down":500,"up":50}')).toEqual({
      down: 500,
      up: 50,
    });
    expect(parsePlan('{"down":500,"up":"50"}')).toEqual({
      down: 500,
      up: null,
    });
  });
});

describe("plan comparison", () => {
  it("detects either saved plan field", () => {
    expect(hasPlan(emptyPlan)).toBe(false);
    expect(hasPlan({ down: 500, up: null })).toBe(true);
    expect(hasPlan({ down: null, up: 50 })).toBe(true);
  });

  it("rounds percentages and rejects missing or invalid speeds", () => {
    expect(planPercent(212, 500)).toBe(42);
    expect(planPercent(undefined, 500)).toBeNull();
    expect(planPercent(212, null)).toBeNull();
    expect(planPercent(0, 500)).toBeNull();
    expect(planPercent(-1, 500)).toBeNull();
    expect(planPercent(Number.NaN, 500)).toBeNull();
    expect(planPercent(Number.POSITIVE_INFINITY, 500)).toBeNull();
    expect(planPercent(100, 0)).toBeNull();
    expect(planPercent(100, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it.each([
    [49, "low"],
    [50, "ok"],
    [79, "ok"],
    [80, "good"],
  ] as const)("uses the rule-of-thumb boundary at %i%%", (pct, tone) => {
    expect(planTone(pct)).toBe(tone);
  });

  it("formats plan chips with a grouped Mbps plan value", () => {
    expect(formatPlanChip(84, 500)).toBe("84% of your 500 Mbps plan");
    expect(formatPlanChip(84, 1500)).toBe("84% of your 1,500 Mbps plan");
  });

  it("formats a short visible plan chip", () => {
    expect(formatPlanChipShort(90)).toBe("90% of plan");
  });
});

describe("plan storage", () => {
  it("loads saved JSON and returns an empty plan for invalid storage", () => {
    const storage = memoryStorage({
      [PLAN_KEY]: '{"down":500,"up":50}',
    });
    expect(loadPlan(storage)).toEqual({ down: 500, up: 50 });
    expect(loadPlan(memoryStorage({ [PLAN_KEY]: "not-json" }))).toEqual(
      emptyPlan,
    );
  });

  it("saves valid plan values and removes an empty plan", () => {
    const storage = memoryStorage();
    savePlan({ down: 500, up: 50 }, storage);
    expect(loadPlan(storage)).toEqual({ down: 500, up: 50 });
    savePlan(emptyPlan, storage);
    expect(storage.getItem(PLAN_KEY)).toBeNull();
  });

  it("catches storage access errors", () => {
    const storage: PlanStorageLike = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadPlan(storage)).toEqual(emptyPlan);
    expect(() => savePlan(emptyPlan, storage)).not.toThrow();
  });
});
