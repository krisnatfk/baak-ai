import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const temporaryDirectories: string[] = [];

describe("fileUrlFromPath", () => {
  afterEach(() => {
    delete process.env.BOT_MEDIA_BASE_URL;
    delete process.env.UPLOAD_DIR;
    for (const directory of temporaryDirectories.splice(0)) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
    vi.resetModules();
  });

  it("menghasilkan URL absolut untuk bot tanpa mengubah external URL", async () => {
    process.env.BOT_MEDIA_BASE_URL = "http://host.docker.internal:3010/";
    const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "baak-media-url-"));
    temporaryDirectories.push(uploadDir);
    process.env.UPLOAD_DIR = uploadDir;
    fs.writeFileSync(path.join(uploadDir, "image-a.jpg"), "image");
    const { fileUrlFromPath } = await import("./media-upload");
    await expect(fileUrlFromPath("uploads/image-a.jpg")).resolves.toBe(
      "http://host.docker.internal:3010/api/files/image-a.jpg",
    );
  });

  it("tidak menghasilkan URL untuk file missing, directory, atau traversal", async () => {
    const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "baak-media-url-"));
    temporaryDirectories.push(uploadDir);
    process.env.UPLOAD_DIR = uploadDir;
    fs.mkdirSync(path.join(uploadDir, "directory.pdf"));
    const { fileUrlFromPath } = await import("./media-upload");

    await expect(fileUrlFromPath("uploads/missing.pdf")).resolves.toBeNull();
    await expect(fileUrlFromPath("uploads/directory.pdf")).resolves.toBeNull();
    await expect(fileUrlFromPath("../outside.pdf")).resolves.toBeNull();
  });
});
