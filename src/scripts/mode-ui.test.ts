import { describe, expect, it } from "vitest";
import { devBadgeVisible } from "./mode-ui";

describe("devBadgeVisible", () => {
  it.each([
    { devMode: false, modeSwitchVisible: false, expected: false },
    { devMode: false, modeSwitchVisible: true, expected: false },
    { devMode: true, modeSwitchVisible: false, expected: true },
    { devMode: true, modeSwitchVisible: true, expected: false },
  ])(
    "returns $expected for devMode=$devMode and modeSwitchVisible=$modeSwitchVisible",
    ({ devMode, modeSwitchVisible, expected }) => {
      expect(devBadgeVisible({ devMode, modeSwitchVisible })).toBe(expected);
    },
  );
});
