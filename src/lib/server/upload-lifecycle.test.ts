import { describe, expect, it, vi } from "vitest";
import { runBestEffortPostCommitCleanup } from "./upload-lifecycle";

describe("runBestEffortPostCommitCleanup", () => {
  it("tidak melempar bila cleanup setelah commit gagal", async () => {
    const failure = new Error("cleanup gagal");
    const onFailure = vi.fn();

    await expect(
      runBestEffortPostCommitCleanup(async () => {
        throw failure;
      }, onFailure),
    ).resolves.toBeUndefined();
    expect(onFailure).toHaveBeenCalledWith(failure);
  });
});
