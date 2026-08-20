import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const temporaryDirectories: string[] = [];

afterEach(() => {
  delete process.env.UPLOAD_DIR;
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  vi.resetModules();
});

describe("upload storage", () => {
  it("resolve terhadap UPLOAD_DIR dan menolak traversal/absolute path di luar root", async () => {
    const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "baak-storage-"));
    temporaryDirectories.push(uploadDir);
    process.env.UPLOAD_DIR = uploadDir;
    const { resolveLocalUploadPath } = await import("./upload-storage");

    expect(resolveLocalUploadPath("uploads/file.pdf")).toBe(path.join(uploadDir, "file.pdf"));
    expect(resolveLocalUploadPath("/app/uploads/file.pdf")).toBe(
      path.join(uploadDir, "file.pdf"),
    );
    expect(resolveLocalUploadPath("../file.pdf")).toBeNull();
    expect(resolveLocalUploadPath(path.join(path.dirname(uploadDir), "outside.pdf"))).toBeNull();
  });

  it("write baru diverifikasi sebagai file dan existence check membedakan missing/directory", async () => {
    const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "baak-storage-"));
    temporaryDirectories.push(uploadDir);
    process.env.UPLOAD_DIR = uploadDir;
    const {
      localUploadFileExists,
      writeLocalUploadFile,
    } = await import("./upload-storage");

    const saved = await writeLocalUploadFile("verified.pdf", new Uint8Array([1, 2, 3]));
    expect(saved.filePath.replace(/\\/g, "/")).toMatch(/\/verified\.pdf$/);
    await expect(localUploadFileExists(saved.filePath)).resolves.toBe(true);
    await expect(localUploadFileExists("uploads/missing.pdf")).resolves.toBe(false);
    fs.mkdirSync(path.join(uploadDir, "folder.pdf"));
    await expect(localUploadFileExists("uploads/folder.pdf")).resolves.toBe(false);
  });
});
