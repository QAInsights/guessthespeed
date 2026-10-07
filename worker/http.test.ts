import { describe, expect, it } from "vitest";
import {
  declaredBodyTooLarge,
  isAllowedWebSocketOrigin,
  utf8LengthExceeds,
} from "./http";
import { alarmToSchedule } from "./alarm";
import { MAX_ROOM_CONNECTIONS, roomHasCapacity } from "./room-capacity";

describe("isAllowedWebSocketOrigin", () => {
  it("allows requests without an Origin header", () => {
    expect(isAllowedWebSocketOrigin(null, "example.com")).toBe(true);
  });

  it("allows an origin with the same host", () => {
    expect(
      isAllowedWebSocketOrigin("https://example.com/path", "example.com"),
    ).toBe(true);
  });

  it("rejects different hosts and ports", () => {
    expect(
      isAllowedWebSocketOrigin("https://evil.example", "example.com"),
    ).toBe(false);
    expect(
      isAllowedWebSocketOrigin("https://example.com:8443", "example.com"),
    ).toBe(false);
  });

  it("rejects unparsable origins", () => {
    expect(isAllowedWebSocketOrigin("not a URL", "example.com")).toBe(false);
  });
});

describe("declaredBodyTooLarge", () => {
  it("allows missing, exact-limit, and smaller lengths", () => {
    expect(declaredBodyTooLarge(null, 256)).toBe(false);
    expect(declaredBodyTooLarge("256", 256)).toBe(false);
    expect(declaredBodyTooLarge("255", 256)).toBe(false);
  });

  it("rejects a declared length above the limit", () => {
    expect(declaredBodyTooLarge("257", 256)).toBe(true);
  });

  it("leaves non-numeric lengths for the actual body-size check", () => {
    expect(declaredBodyTooLarge("unknown", 256)).toBe(false);
  });
});

describe("roomHasCapacity", () => {
  it("allows fewer than the maximum and rejects at or above it", () => {
    expect(MAX_ROOM_CONNECTIONS).toBe(24);
    expect(roomHasCapacity(MAX_ROOM_CONNECTIONS - 1)).toBe(true);
    expect(roomHasCapacity(MAX_ROOM_CONNECTIONS)).toBe(false);
    expect(roomHasCapacity(MAX_ROOM_CONNECTIONS + 1)).toBe(false);
  });
});

describe("utf8LengthExceeds", () => {
  it("checks ASCII text below, at, and above the byte limit", () => {
    expect(utf8LengthExceeds("ab", 3)).toBe(false);
    expect(utf8LengthExceeds("abc", 3)).toBe(false);
    expect(utf8LengthExceeds("abcd", 3)).toBe(true);
  });

  it("counts three-byte characters when they straddle the limit", () => {
    expect(utf8LengthExceeds("a€", 3)).toBe(true);
    expect(utf8LengthExceeds("a€", 4)).toBe(false);
  });

  it("counts an emoji surrogate pair as four UTF-8 bytes", () => {
    expect(utf8LengthExceeds("😀", 3)).toBe(true);
    expect(utf8LengthExceeds("😀", 4)).toBe(false);
  });

  it("short-circuits strings already longer than the maximum", () => {
    expect(utf8LengthExceeds("a".repeat(1024), 256)).toBe(true);
  });
});

describe("alarmToSchedule", () => {
  it("schedules a deadline only when no alarm exists", () => {
    expect(alarmToSchedule(null, 123)).toBe(123);
    expect(alarmToSchedule(100, 123)).toBeNull();
  });
});
