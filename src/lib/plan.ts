import { isRecord } from "./guards";
import type { StorageLike } from "./game";

export const PLAN_KEY = "gts:plan";

export interface InternetPlan {
  down: number | null;
  up: number | null;
}

export interface PlanStorageLike extends StorageLike {
  removeItem(key: string): void;
}

const emptyPlan = (): InternetPlan => ({ down: null, up: null });

function validPlanSpeed(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 1 &&
    value <= 10000
    ? value
    : null;
}

export function parsePlan(raw: unknown): InternetPlan {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return emptyPlan();
    }
  }
  if (!isRecord(value)) return emptyPlan();
  return {
    down: validPlanSpeed(value.down),
    up: validPlanSpeed(value.up),
  };
}

export function hasPlan(plan: InternetPlan): boolean {
  return plan.down !== null || plan.up !== null;
}

export function planPercent(
  measured: number | undefined,
  planned: number | null,
): number | null {
  if (
    measured === undefined ||
    planned === null ||
    !Number.isFinite(measured) ||
    !Number.isFinite(planned) ||
    measured <= 0 ||
    planned <= 0
  )
    return null;
  return Math.round((measured / planned) * 100);
}

export function planTone(pct: number): "good" | "ok" | "low" {
  return pct >= 80 ? "good" : pct >= 50 ? "ok" : "low";
}

export function formatPlanChip(pct: number, planned: number): string {
  return `${pct}% of your ${planned.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })} Mbps plan`;
}

export function formatPlanChipShort(pct: number): string {
  return `${pct}% of plan`;
}

export function loadPlan(storage?: PlanStorageLike): InternetPlan {
  try {
    const target =
      storage ??
      (typeof localStorage === "undefined" ? undefined : localStorage);
    return target ? parsePlan(target.getItem(PLAN_KEY)) : emptyPlan();
  } catch {
    return emptyPlan();
  }
}

export function savePlan(plan: InternetPlan, storage?: PlanStorageLike): void {
  try {
    const target =
      storage ??
      (typeof localStorage === "undefined" ? undefined : localStorage);
    if (!target) return;
    const parsed = parsePlan(plan);
    if (!hasPlan(parsed)) {
      target.removeItem(PLAN_KEY);
      return;
    }
    target.setItem(PLAN_KEY, JSON.stringify(parsed));
  } catch {
    return;
  }
}
