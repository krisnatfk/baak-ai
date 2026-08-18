/**
 * Ekstraksi teks mentah dari file dokumen (PDF / DOCX / TXT) — server-only.
 *
 * PDF memakai `pdf-parse` v2 (API class-based: `new PDFParse({ data })` →
 * `getText()` → `destroy()`). DOCX memakai `mammoth`. TXT dibaca sebagai
 * UTF-8. Library berat dimuat secara dinamis (lazy) agar tidak masuk bundle
 * yang dipakai komponen client.
 */

import { extractRawText } from "mammoth";
import type { ExtractableFileType } from "./file-type";

/** Ekstraksi teks dari buffer sesuai tipe file. Selalu resolve string (bisa kosong). */
export async function extractTextFromBuffer(
  buffer: Buffer,
  type: ExtractableFileType,
): Promise<string> {
  switch (type) {
    case "TXT":
      return buffer.toString("utf8");
    case "DOCX":
      return extractDocx(buffer);
    case "PDF":
      return extractPdf(buffer);
  }
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const { value } = await extractRawText({ buffer });
  return value;
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const { text } = await parser.getText();
    return text;
  } finally {
    await parser.destroy();
  }
}
