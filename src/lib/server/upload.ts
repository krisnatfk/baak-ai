/**
 * Penyimpanan file upload ke disk (server-only).
 *
 * File disimpan di `env.uploadDir` (UPLOAD_DIR, default "uploads").
 * Di Docker, folder ini di-mount sebagai volume `baak_uploads:/app/uploads`
 * (lihat docker-compose.yml) agar dokumen bertahan saat container dibuat ulang.
 *
 * Nama file disimpan ditulis ulang (slug + timestamp + random) untuk
 * menghindari tabrakan nama, path traversal, dan nama berbahaya dari client.
 * Nama asli tetap disimpan di kolom `file_name` untuk ditampilkan.
 */

import path from "node:path";
import { randomBytes } from "node:crypto";
import { getMaxUploadMb } from "@/lib/env";
import { formatBytes } from "@/lib/format";
import { writeLocalUploadFile } from "@/lib/server/upload-storage";
import {
  detectFileType,
  type ExtractableFileType,
} from "@/services/document/file-type";

export const MAX_UPLOAD_BYTES = getMaxUploadMb() * 1024 * 1024;

export interface SavedUpload {
  /** Nama file asli dari pengguna (untuk ditampilkan). */
  fileName: string;
  /** Path relatif POSIX (mis. `uploads/xxx.pdf`) — disimpan ke kolom file_path. */
  filePath: string;
  fileSize: number;
  fileType: ExtractableFileType;
}

/** Error bisnis upload (pesan siap ditampilkan ke pengguna). */
export class UploadError extends Error {}

const EXTENSION_BY_TYPE: Record<ExtractableFileType, string> = {
  PDF: ".pdf",
  DOCX: ".docx",
  TXT: ".txt",
};

/**
 * Validasi + simpan `File` ke disk. Melempar `UploadError` untuk kesalahan
 * yang bisa ditampilkan; error lain dibiarkan melewati (ditangani caller).
 */
export async function saveUpload(file: File): Promise<SavedUpload> {
  if (!file || file.size <= 0) {
    throw new UploadError("File kosong. Pilih dokumen yang valid.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadError(
      `Ukuran file ${formatBytes(file.size)} melebihi batas ${getMaxUploadMb()} MB.`,
    );
  }

  const fileType = detectFileType(file.name);
  if (!fileType) {
    throw new UploadError("Tipe file tidak didukung. Unggah PDF, DOCX, atau TXT.");
  }

  const originalName = path.basename(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());

  const storedName = buildStoredName(originalName, EXTENSION_BY_TYPE[fileType]);
  let filePath: string;
  try {
    ({ filePath } = await writeLocalUploadFile(storedName, buffer));
  } catch {
    throw new UploadError("Gagal menyimpan file upload. Silakan coba lagi.");
  }

  return {
    fileName: originalName,
    filePath,
    fileSize: file.size,
    fileType,
  };
}

/**
 * Nama file tersimpan: slug + timestamp + random, agar unik dan aman.
 * Contoh: `pedoman-akademik-2025-l7f3k2-a91bc0.pdf`.
 */
function buildStoredName(originalName: string, ext: string): string {
  const dot = originalName.lastIndexOf(".");
  const base = dot > 0 ? originalName.slice(0, dot) : originalName;
  const slug = slugify(base).slice(0, 60) || "dokumen";
  const stamp = Date.now().toString(36);
  const rand = randomBytes(3).toString("hex");
  return `${slug}-${stamp}-${rand}${ext}`;
}

/** Slugify: NFKD, buang diakritik, non-alphanumeric → dash. */
function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}
