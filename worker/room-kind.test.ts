import { describe, expect, it } from "vitest";
import { parseRoomKind } from "./room-kind";

describe("parseRoomKind", () => {
  it("accepts team rooms and defaults every other body to family", () => {
    expect(parseRoomKind('{"kind":"team"}')).toBe("team");
    expect(parseRoomKind("")).toBe("family");
    expect(parseRoomKind('{"kind":"family"}')).toBe("family");
    expect(parseRoomKind('{"kind":"other"}')).toBe("family");
    expect(parseRoomKind("not JSON")).toBe("family");
  });
});
