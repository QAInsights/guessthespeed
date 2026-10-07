import { afterEach, describe, expect, it, vi } from "vitest";
import { readRoomLocalSettings } from "./room-settings";

function stubRoomSettings(value: string) {
  vi.stubGlobal("localStorage", {
    getItem: () => value,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("room local settings", () => {
  it("defaults confetti on unless a boolean preference is saved", () => {
    stubRoomSettings(JSON.stringify({ confetti: "off" }));
    expect(readRoomLocalSettings().confetti).toBe(true);

    stubRoomSettings(JSON.stringify({ confetti: false }));
    expect(readRoomLocalSettings().confetti).toBe(false);
  });

  it("defaults animated borders on unless a boolean preference is saved", () => {
    stubRoomSettings(JSON.stringify({ animatedBorders: "off" }));
    expect(readRoomLocalSettings().animatedBorders).toBe(true);

    stubRoomSettings(JSON.stringify({ animatedBorders: false }));
    expect(readRoomLocalSettings().animatedBorders).toBe(false);
  });
});
