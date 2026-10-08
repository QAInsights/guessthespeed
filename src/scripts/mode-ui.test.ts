import { describe, expect, it } from "vitest";
import { modeSwitchHidden } from "./mode-ui";

describe("modeSwitchHidden", () => {
  it.each([
    {
      scenario: "room mode stays hidden with Dev enabled",
      input: {
        roomMode: true,
        tvMode: true,
        tvLayout: true,
        devMode: true,
      },
      expected: true,
    },
    {
      scenario: "TV desktop Game mode is hidden",
      input: {
        roomMode: false,
        tvMode: true,
        tvLayout: true,
        devMode: false,
      },
      expected: true,
    },
    {
      scenario: "TV desktop Dev mode is visible",
      input: {
        roomMode: false,
        tvMode: true,
        tvLayout: true,
        devMode: true,
      },
      expected: false,
    },
    {
      scenario: "TV phone layout is visible",
      input: {
        roomMode: false,
        tvMode: true,
        tvLayout: false,
        devMode: false,
      },
      expected: false,
    },
    {
      scenario: "plain non-TV mode is visible",
      input: {
        roomMode: false,
        tvMode: false,
        tvLayout: true,
        devMode: false,
      },
      expected: false,
    },
  ])("$scenario", ({ input, expected }) => {
    expect(modeSwitchHidden(input)).toBe(expected);
  });
});
