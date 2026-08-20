/**
 * Single source of truth untuk file lokal di UPLOAD_DIR.
 *
 * Seluruh upload, serving, validasi RAG, audit, dan cleanup harus melewati
 * helper ini agar resolusi path dan pemeriksaan containment selalu identik.
 */

import fs from "node:fs";
import path from "node:path";
import { getUploadDir, resolveUploadDir } from "@/lib/env";

export interface LocalUploadFile {
  absolutePath: string;
  relativePath: string;
  stat: fs.Stats;
}

function isContained(root: string, target: string): boolean {
  return target !== root && target.startsWith(`${root}${path.sep}`);
}

function hasUnsafeSegment(value: string): boolean {
  const portable = value.replace(/\\/g, "/");
  return portable.split("/").some((segment) => segment === "." || segment === "..");
}

/**
 * Resolve path DB/URL ke UPLOAD_DIR secara lexical.
 *
 * Format yang didukung:
 * - nama file relatif (`file.pdf`),
 * - path DB lama (`uploads/file.pdf`),
 * - path absolut yang memang berada di UPLOAD_DIR (`/app/uploads/file.pdf`).
 *
 * Path traversal, root directory, NUL byte, dan absolute path di luar root
 * dikembalikan sebagai null, bukan exception.
 */
export function resolveLocalUploadPath(filePath: string): string | null {
  const value = filePath.trim();
  if (!value || value.includes("\0") || hasUnsafeSegment(value)) return null;

  const uploadRoot = resolveUploadDir();
  const portable = value.replace(/\\/g, "/");
  const rootName = path.basename(uploadRoot);
  const isAbsolute = path.isAbsolute(value) || path.win32.isAbsolute(value);

  let target: string;
  if (isAbsolute) {
    target = path.resolve(value);
    if (!isContained(uploadRoot, target)) {
      // Path absolut lama dapat berasal dari runtime lain (contoh container
      // `/app/uploads/...` saat audit dijalankan dari host bind source).
      // Ambil hanya suffix setelah folder upload, lalu resolve ulang ke root
      // aktif; absolute path lain tetap ditolak.
      const segments = portable.split("/").filter(Boolean);
      const uploadIndex = Math.max(
        segments.lastIndexOf(rootName),
        segments.lastIndexOf("uploads"),
      );
      if (uploadIndex < 0 || uploadIndex === segments.length - 1) return null;
      target = path.resolve(uploadRoot, ...segments.slice(uploadIndex + 1));
    }
  } else {
    const segments = portable.split("/").filter(Boolean);
    if (segments[0] === rootName || segments[0] === "uploads") segments.shift();
    if (segments.length === 0) return null;
    target = path.resolve(uploadRoot, ...segments);
  }

  return isContained(uploadRoot, target) ? target : null;
}

/**
 * Resolve file yang benar-benar ada, berupa regular file, dan tidak keluar
 * dari UPLOAD_DIR melalui symlink. Missing/invalid selalu menghasilkan null.
 */
export async function getLocalUploadFile(
  filePath: string | null | undefined,
): Promise<LocalUploadFile | null> {
  if (!filePath) return null;
  const lexicalPath = resolveLocalUploadPath(filePath);
  if (!lexicalPath) return null;

  try {
    const uploadRoot = resolveUploadDir();
    const [realRoot, realTarget, stat] = await Promise.all([
      fs.promises.realpath(uploadRoot),
      fs.promises.realpath(/* turbopackIgnore: true */ lexicalPath),
      fs.promises.stat(/* turbopackIgnore: true */ lexicalPath),
    ]);
    if (!stat.isFile() || !isContained(realRoot, realTarget)) return null;

    return {
      absolutePath: realTarget,
      relativePath: path.relative(realRoot, realTarget),
      stat,
    };
  } catch {
    return null;
  }
}

/** Missing, directory, traversal, dan symlink escape semuanya return false. */
export async function localUploadFileExists(
  filePath: string | null | undefined,
): Promise<boolean> {
  return (await getLocalUploadFile(filePath)) !== null;
}

/** Path yang disimpan ke DB untuk file baru (kompatibel dengan konfigurasi lama). */
export function storedUploadPath(storedName: string): string {
  const safeName = path.basename(storedName);
  const configuredDir = getUploadDir().replace(/\\/g, "/").replace(/\/+$/, "");
  return `${configuredDir}/${safeName}`;
}

/**
 * Tulis file baru, lalu verifikasi file fisik dan ukurannya sebelum metadata
 * boleh disimpan ke DB. File parsial dibersihkan bila verifikasi gagal.
 */
export async function writeLocalUploadFile(
  storedName: string,
  data: Uint8Array,
): Promise<{ absolutePath: string; filePath: string }> {
  const uploadRoot = resolveUploadDir();
  await fs.promises.mkdir(uploadRoot, { recursive: true });

  const absolutePath = resolveLocalUploadPath(path.basename(storedName));
  if (!absolutePath) throw new Error("Path file upload tidak valid.");

  try {
    await fs.promises.writeFile(absolutePath, data, { flag: "wx" });
    const verified = await getLocalUploadFile(absolutePath);
    if (!verified || verified.stat.size !== data.byteLength) {
      throw new Error("Verifikasi file upload gagal.");
    }
    return { absolutePath, filePath: storedUploadPath(storedName) };
  } catch (error) {
    await fs.promises.unlink(absolutePath).catch(() => undefined);
    throw error;
  }
}

/** Best-effort unlink; invalid/missing path tidak melempar. */
export async function removeLocalUploadFile(
  filePath: string | null | undefined,
): Promise<void> {
  if (!filePath) return;
  const target = resolveLocalUploadPath(filePath);
  if (!target) return;
  await fs.promises.unlink(target).catch(() => undefined);
}
