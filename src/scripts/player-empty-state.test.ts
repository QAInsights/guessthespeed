import { describe, expect, it } from "vitest";
import { playerEmptyState } from "./player-empty-state";

describe("playerEmptyState", () => {
  it("returns a joining state in a room before state arrives", () => {
    expect(playerEmptyState(true, false)).toBe("joining");
  });

  it("returns the normal empty state after room state arrives", () => {
    expect(playerEmptyState(true, true)).toBe("empty");
  });

  it("keeps the normal empty state outside room mode", () => {
    expect(playerEmptyState(false, false)).toBe("empty");
  });
});
