import { describe, expect, it } from "vitest";
import { isRecord } from "./guards";

describe("isRecord", () => {
  it("accepts non-null, non-array objects", () => {
    expect(isRecord({ name: "Ada" })).toBe(true);
  });

  it("rejects null, arrays, and primitives", () => {
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(isRecord("record")).toBe(false);
    expect(isRecord(1)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
  });
});
