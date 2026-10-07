import { describe, expect, it } from "vitest";
import { emptyPlayerMarkup } from "./player-empty-state";

describe("emptyPlayerMarkup", () => {
  it("shows a joining state in a room before state arrives", () => {
    expect(emptyPlayerMarkup(true, false)).toContain(
      "<p>Joining the room…</p>",
    );
  });

  it("shows the normal empty state after room state arrives", () => {
    expect(emptyPlayerMarkup(true, true)).toContain(
      "<p>Add the first player</p>",
    );
  });

  it("keeps the normal empty state outside room mode", () => {
    expect(emptyPlayerMarkup(false, false)).toContain(
      "<p>Add the first player</p>",
    );
  });
});
