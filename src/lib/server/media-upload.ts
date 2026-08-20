/**
 * Upload media (gambar) dan lampiran file FAQ ke disk (server-only).
 *
 * Keamanan (sesuai review desain):
 *  - Deteksi tipe dari EKSTENSI + verifikasi MAGIC BYTES (sniff header file),
 *    bukan hanya dari nama file — mencegah file berpura-pura PDF/gambar.
 *  - Ukuran dibatasi MAX_UPLOAD_MB (sama dengan dokumen).
 *  - Nama file disimpan ditulis ulang (slug + timestamp + random) agar aman.
 *  - Hanya metadata yang disimpan di DB; file disajikan via /api/files/[...path]
 *    dengan Content-Disposition + nosniff (lihat route handler).
 *
 * File disimpan di env.uploadDir (UPLOAD_DIR, default "uploads"), di-mount
 * sebagai volume di Docker agar bertahan saat container dibuat ulang.
 */

import path from "node:path";
import { randomBytes } from "node:crypto";
import { getBotMediaBaseUrl, getMaxUploadMb } from "@/lib/env";
import { formatBytes } from "@/lib/format";
import { getLocalUploadFile, writeLocalUploadFile } from "@/lib/server/upload-storage";

export const MEDIA_MAX_BYTES = getMaxUploadMb() * 1024 * 1024;

/** Error bisnis upload (pesan siap ditampilkan ke pengguna). */
export class MediaUploadError extends Error {}

export type ImageKind = "JPEG" | "PNG" | "WEBP" | "GIF";
export type AttachmentKind = "PDF" | "DOC" | "DOCX" | "XLS" | "XLSX";

export interface SavedMediaFile {
  /** Nama file asli dari pengguna (untuk ditampilkan). */
  fileName: string;
  /** Path relatif POSIX (mis. `uploads/xxx.png`) — disimpan ke kolom file_path. */
  filePath: string;
  fileSize: number;
  mimeType: string;
}

export interface SavedAttachmentFile extends SavedMediaFile {
  kind: AttachmentKind;
}

interface Signature {
  kind: ImageKind | AttachmentKind;
  ext: string;
  mime: string;
  /** Byte pertama yang membuktikan jenis file. */
  magic: number[];
}

/** Tabel tanda tangan file (magic bytes) + ekstensi yang cocok. */
const IMAGE_SIGNATURES: Signature[] = [
  {
    kind: "JPEG",
    ext: ".jpg",
    mime: "image/jpeg",
    magic: [0xff, 0xd8, 0xff],
  },
  {
    kind: "PNG",
    ext: ".png",
    mime: "image/png",
    magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  {
    kind: "WEBP",
    ext: ".webp",
    mime: "image/webp",
    magic: [0x52, 0x49, 0x46, 0x46], // "RIFF" — cek "WEBP" pada offset 8
  },
  {
    kind: "GIF",
    ext: ".gif",
    mime: "image/gif",
    magic: [0x47, 0x49, 0x46, 0x38],
  },
];

const ATTACHMENT_SIGNATURES: Signature[] = [
  {
    kind: "PDF",
    ext: ".pdf",
    mime: "application/pdf",
    magic: [0x25, 0x50, 0x44, 0x46], // "%PDF"
  },
  {
    kind: "DOC",
    ext: ".doc",
    mime: "application/msword",
    magic: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], // OLE2
  },
  {
    kind: "XLS",
    ext: ".xls",
    mime: "application/vnd.ms-excel",
    magic: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], // OLE2
  },
  {
    kind: "DOCX",
    ext: ".docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    magic: [0x50, 0x4b, 0x03, 0x04], // ZIP
  },
  {
    kind: "XLSX",
    ext: ".xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    magic: [0x50, 0x4b, 0x03, 0x04], // ZIP
  },
];

/** Jenis ekstensi yang dapat disajikan inline oleh /api/files (gambar). */
export const INLINE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

/** Ekstensi yang diizinkan per kategori → kind (huruf kunci lowercase). */
const IMAGE_EXT_BY_KIND: Record<ImageKind, string[]> = {
  JPEG: [".jpg", ".jpeg"],
  PNG: [".png"],
  WEBP: [".webp"],
  GIF: [".gif"],
};
const ATTACHMENT_EXT_BY_KIND: Record<AttachmentKind, string[]> = {
  PDF: [".pdf"],
  DOC: [".doc"],
  DOCX: [".docx"],
  XLS: [".xls"],
  XLSX: [".xlsx"],
};

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : "";
}

function startsWith(buffer: Uint8Array, magic: number[]): boolean {
  if (buffer.length < magic.length) return false;
  for (let i = 0; i < magic.length; i++) {
    if (buffer[i] !== magic[i]) return false;
  }
  return true;
}

/**
 * Deteksi jenis GAMBAR: ekstensi harus cocok dengan salah satu tipe gambar,
 * DAN magic bytes buffer harus cocok. Mengembalikan null bila tidak valid.
 */
export function detectImage(fileName: string, buffer: Uint8Array): ImageKind | null {
  const ext = extensionOf(fileName);
  for (const signature of IMAGE_SIGNATURES) {
    if (!IMAGE_EXT_BY_KIND[signature.kind as ImageKind].includes(ext)) continue;
    // WebP: magic "RIFF" + 4 byte apa pun + "WEBP".
    if (signature.kind === "WEBP") {
      if (
        buffer.length >= 12 &&
        startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) &&
        startsWith(buffer.slice(8), [0x57, 0x45, 0x42, 0x50])
      ) {
        return "WEBP";
      }
      continue;
    }
    if (startsWith(buffer, signature.magic)) return signature.kind as ImageKind;
  }
  return null;
}

/**
 * Deteksi jenis LAMPIRAN: ekstensi + magic bytes. DOC dan XLS sama-sama OLE2;
 * DOCX dan XLSX sama-sama ZIP — untuk pasangan ini validasi utamakan
 * kecocokan ekstensi (jenis riil dibedakan isi zip, di luar cakupan ini).
 */
export function detectAttachment(
  fileName: string,
  buffer: Uint8Array,
): AttachmentKind | null {
  const ext = extensionOf(fileName);
  for (const signature of ATTACHMENT_SIGNATURES) {
    if (!ATTACHMENT_EXT_BY_KIND[signature.kind as AttachmentKind].includes(ext)) {
      continue;
    }
    if (startsWith(buffer, signature.magic)) return signature.kind as AttachmentKind;
  }
  return null;
}

/** Nama file tersimpan: slug + timestamp + random, agar unik dan aman. */
function buildStoredName(originalName: string, ext: string): string {
  const dot = originalName.lastIndexOf(".");
  const base = dot > 0 ? originalName.slice(0, dot) : originalName;
  const slug = slugify(base).slice(0, 60) || "lampiran";
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

async function assertNotEmptyAndSize(file: File): Promise<Uint8Array> {
  if (!file || file.size <= 0) {
    throw new MediaUploadError("File kosong. Pilih file yang valid.");
  }
  if (file.size > MEDIA_MAX_BYTES) {
    throw new MediaUploadError(
      `Ukuran file ${formatBytes(file.size)} melebihi batas ${getMaxUploadMb()} MB.`,
    );
  }
  return new Uint8Array(await file.arrayBuffer());
}

async function writeStored(
  file: File,
  kind: ImageKind | AttachmentKind,
  ext: string,
  originalName: string,
): Promise<SavedMediaFile> {
  const buffer = await assertNotEmptyAndSize(file);

  const storedName = buildStoredName(originalName, ext);
  let filePath: string;
  try {
    ({ filePath } = await writeLocalUploadFile(storedName, buffer));
  } catch {
    throw new MediaUploadError("Gagal menyimpan file upload. Silakan coba lagi.");
  }

  const mime =
    (kind === "JPEG"
      ? "image/jpeg"
      : kind === "PNG"
        ? "image/png"
        : kind === "WEBP"
          ? "image/webp"
          : kind === "GIF"
            ? "image/gif"
            : kind === "PDF"
              ? "application/pdf"
              : kind === "DOC"
                ? "application/msword"
                : kind === "DOCX"
                  ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  : kind === "XLS"
                    ? "application/vnd.ms-excel"
                    : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") as string;

  return {
    fileName: originalName,
    filePath,
    fileSize: file.size,
    mimeType: mime,
  };
}

/** Simpan file GAMBAR (dengan verifikasi magic bytes). Melempar MediaUploadError. */
export async function saveImageFile(file: File): Promise<SavedMediaFile> {
  const buffer = await assertNotEmptyAndSize(file);
  const kind = detectImage(file.name, buffer);
  if (!kind) {
    throw new MediaUploadError(
      "File gambar tidak valid. Unggah JPEG, PNG, WebP, atau GIF.",
    );
  }
  const ext = IMAGE_EXT_BY_KIND[kind][0];
  return writeStored(file, kind, ext, path.basename(file.name));
}

/** Simpan file LAMPIRAN (dengan verifikasi magic bytes). Melempar MediaUploadError. */
export async function saveAttachmentFile(
  file: File,
): Promise<SavedAttachmentFile> {
  const buffer = await assertNotEmptyAndSize(file);
  const kind = detectAttachment(file.name, buffer);
  if (!kind) {
    throw new MediaUploadError(
      "Tipe lampiran tidak valid. Unggah PDF, DOC, DOCX, XLS, atau XLSX.",
    );
  }
  const ext = ATTACHMENT_EXT_BY_KIND[kind][0];
  const saved = await writeStored(file, kind, ext, path.basename(file.name));
  return { ...saved, kind };
}

/** URL akses file dari file_path tersimpan (relatif ke /api/files). */
export async function fileUrlFromPath(
  filePath: string | null | undefined,
): Promise<string | null> {
  const file = await getLocalUploadFile(filePath);
  if (!file) return null;
  const encodedPath = file.relativePath
    .split(path.sep)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const relativeUrl = `/api/files/${encodedPath}`;
  const botBaseUrl = getBotMediaBaseUrl();
  return botBaseUrl ? `${botBaseUrl}${relativeUrl}` : relativeUrl;
}
