import { describe, expect, it } from "vitest";
import { shortcutAction, type ShortcutInput } from "./shortcuts";

const input = (overrides: Partial<ShortcutInput> = {}): ShortcutInput => ({
  key: "",
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  repeat: false,
  target: "other",
  overlayOpen: false,
  ...overrides,
});

describe("shortcutAction", () => {
  it("maps Space and Enter to the primary action", () => {
    expect(shortcutAction(input({ key: " " }))).toBe("primary");
    expect(shortcutAction(input({ key: "Enter" }))).toBe("primary");
  });

  it("maps N and F in either case", () => {
    expect(shortcutAction(input({ key: "n" }))).toBe("next");
    expect(shortcutAction(input({ key: "N" }))).toBe("next");
    expect(shortcutAction(input({ key: "f" }))).toBe("fullscreen");
    expect(shortcutAction(input({ key: "F" }))).toBe("fullscreen");
  });

  it("ignores modified keys", () => {
    expect(shortcutAction(input({ key: " ", ctrlKey: true }))).toBeNull();
    expect(shortcutAction(input({ key: "n", metaKey: true }))).toBeNull();
    expect(shortcutAction(input({ key: "f", altKey: true }))).toBeNull();
  });

  it("ignores repeated keydown events", () => {
    expect(shortcutAction(input({ key: " ", repeat: true }))).toBeNull();
    expect(shortcutAction(input({ key: "n", repeat: true }))).toBeNull();
    expect(shortcutAction(input({ key: "f", repeat: true }))).toBeNull();
  });

  it("ignores keys from text inputs", () => {
    expect(shortcutAction(input({ key: " ", target: "text" }))).toBeNull();
    expect(shortcutAction(input({ key: "Enter", target: "text" }))).toBeNull();
    expect(shortcutAction(input({ key: "n", target: "text" }))).toBeNull();
    expect(shortcutAction(input({ key: "f", target: "text" }))).toBeNull();
  });

  it("does not double-activate controls for Space or Enter", () => {
    expect(shortcutAction(input({ key: " ", target: "control" }))).toBeNull();
    expect(
      shortcutAction(input({ key: "Enter", target: "control" })),
    ).toBeNull();
  });

  it("allows N and F from controls", () => {
    expect(shortcutAction(input({ key: "n", target: "control" }))).toBe("next");
    expect(shortcutAction(input({ key: "F", target: "control" }))).toBe(
      "fullscreen",
    );
  });

  it("ignores shortcuts while an overlay is open", () => {
    expect(shortcutAction(input({ key: " ", overlayOpen: true }))).toBeNull();
    expect(shortcutAction(input({ key: "n", overlayOpen: true }))).toBeNull();
    expect(shortcutAction(input({ key: "f", overlayOpen: true }))).toBeNull();
  });
});
