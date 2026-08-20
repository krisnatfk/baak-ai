/**
 * GET /api/files/[...path] — sajikan file upload (gambar/lampiran FAQ).
 *
 * Keamanan (sesuai review desain #15):
 *  - Resolusi path DIBATASI ke dalam UPLOAD_DIR (cek containment, tolak
 *    traversal). Nama file di disk selalu ditulis ulang (slug+timestamp+random),
 *    jadi nama asli pengguna tidak pernah dipakai sebagai nama fisik.
 *  - Content-Disposition: inline hanya untuk gambar (INLINE_EXTENSIONS);
 *    selain itu attachment (n8n/WAHA mengunduh lalu mengirim ke user).
 *  - X-Content-Type-Options: nosniff — mencegah browser menebak tipe MIME.
 *  - Header Cache-Control immutable karena nama file tersimpan unik + acak.
 *
 * Endpoint ini publik (tanpa INTERNAL_API_KEY) karena URL file memang
 * dimaksudkan untuk diakses pengguna akhir via bot WhatsApp; nama file acak
 * membuat enumerasi tidak praktis. Tidak ada secret/data internal yang bocor —
 * hanya berkas yang sengaja diunggah admin untuk FAQ.
 */

import fs from "node:fs";
import path from "node:path";
import { INLINE_EXTENSIONS } from "@/lib/server/media-upload";
import { getLocalUploadFile } from "@/lib/server/upload-storage";

export const dynamic = "force-dynamic";

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".txt": "text/plain",
};

interface FilesRouteContext {
  params: Promise<{ path: string[] }>;
}

export async function GET(
  _request: Request,
  { params }: FilesRouteContext,
): Promise<Response> {
  const segments = (await params).path ?? [];
  if (segments.length === 0) {
    return new Response("Not Found", { status: 404 });
  }

  // Tolak traversal & segmen kosong/hidden sedini mungkin.
  for (const raw of segments) {
    if (raw === ".." || raw === "." || raw === "" || raw.startsWith(".")) {
      return new Response("Not Found", { status: 404 });
    }
  }

  const requested = segments.map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  });

  // Jika satu segmen masih mengandung pemisah setelah decode, tolak.
  if (requested.some((segment) => segment.includes("/") || segment.includes("\\"))) {
    return new Response("Not Found", { status: 404 });
  }

  const file = await getLocalUploadFile(requested.join("/"));
  if (!file) {
    return new Response("Not Found", { status: 404 });
  }
  const data = await fs.promises.readFile(file.absolutePath).catch(() => null);
  if (!data) return new Response("Not Found", { status: 404 });

  const ext = path.extname(file.absolutePath).toLowerCase();
  const mimeType = MIME_BY_EXT[ext] ?? "application/octet-stream";
  const isInline = INLINE_EXTENSIONS.has(ext);

  // Nama file fisik (sudah aman: slug+timestamp+random) untuk Content-Disposition.
  const baseName = path.basename(file.absolutePath);
  const disposition = isInline
    ? "inline"
    : `attachment; filename="${baseName.replace(/["\\]/g, "_")}"`;

  return new Response(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Disposition": disposition,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": String(data.byteLength),
    },
  });
}
