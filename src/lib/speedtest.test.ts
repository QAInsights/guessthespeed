import { describe, expect, it } from "vitest";
import { runSpeedTest, SpeedTestCancelledError } from "./speedtest";

describe("runSpeedTest", () => {
  it("rejects an already-aborted room test before starting measurements", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      runSpeedTest(() => {}, { signal: controller.signal }),
    ).rejects.toBeInstanceOf(SpeedTestCancelledError);
  });
});
