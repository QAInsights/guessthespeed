import { describe, expect, it } from "vitest";
import { musicTrack } from "./music";

const base = {
  enabled: true,
  dev: false,
  phase: "guessing",
  testing: false,
  championOpen: false,
};

describe("musicTrack", () => {
  it("stays silent unless music is enabled, and in Dev mode", () => {
    expect(musicTrack({ ...base, enabled: false })).toBeNull();
    expect(
      musicTrack({ ...base, enabled: false, championOpen: true }),
    ).toBeNull();
    expect(musicTrack({ ...base, dev: true })).toBeNull();
  });

  it("loops the lobby theme while guessing and on results", () => {
    expect(musicTrack(base)).toBe("lobby");
    expect(musicTrack({ ...base, phase: "results" })).toBe("lobby");
  });

  it("goes quiet during the speed test and the reveal", () => {
    expect(musicTrack({ ...base, testing: true })).toBeNull();
    expect(musicTrack({ ...base, phase: "results", testing: true })).toBeNull();
  });

  it("plays the fanfare only while the champion screen is open", () => {
    expect(musicTrack({ ...base, phase: "champion", championOpen: true })).toBe(
      "champion",
    );
    expect(musicTrack({ ...base, phase: "champion" })).toBeNull();
  });
});
