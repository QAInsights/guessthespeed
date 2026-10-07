import { afterEach, describe, expect, it, vi } from "vitest";
import { $, $$, queryOptional } from "./dom";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DOM query helpers", () => {
  it("queries one or many descendants from the supplied root", () => {
    const first = {} as Element;
    const second = {} as Element;
    const root = {
      querySelector: vi.fn(() => first),
      querySelectorAll: vi.fn(() => [first, second]),
    } as unknown as ParentNode;

    expect($<Element>(".item", root)).toBe(first);
    expect($$<Element>(".item", root)).toEqual([first, second]);
  });

  it("returns an optional document match", () => {
    const match = {} as Element;
    vi.stubGlobal("document", {
      querySelector: (selector: string) =>
        selector === ".match" ? match : null,
    });

    expect(queryOptional<Element>(".match")).toBe(match);
    expect(queryOptional<Element>(".missing")).toBeNull();
  });
});
