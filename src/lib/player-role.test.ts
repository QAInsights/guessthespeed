import { describe, expect, it } from "vitest";
import { hasDistinctRole } from "./player-role";

describe("hasDistinctRole", () => {
  it("hides a role that matches the trimmed name without case sensitivity", () => {
    expect(hasDistinctRole("Mom", " mom ")).toBe(false);
  });

  it("keeps a role that differs from the name", () => {
    expect(hasDistinctRole("Mom", "Dad")).toBe(true);
  });

  it("hides an empty role", () => {
    expect(hasDistinctRole("Mom", " ")).toBe(false);
  });
});
