import { describe, expect, it } from "vitest";
import { articleText } from "./reading-time";

describe("articleText", () => {
  it("includes FAQ answers rendered from frontmatter", () => {
    const text = articleText("/mbps-to-mbs/");
    expect(text).toContain("a mebibyte is 1,048,576 bytes");
    expect(text).not.toMatch(/\{|\}/);
  });
});
