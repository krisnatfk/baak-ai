/**
 * Tipe file dokumen yang didukung untuk upload knowledge base.
 *
 * Modul ini PURE — tidak mengimpor library eksternal apa pun agar aman
 * dipakai dari komponen client (untuk validasi tipe file di sisi UI).
 */

export type ExtractableFileType = "PDF" | "DOCX" | "TXT";

/** Ekstensi yang didukung → tipe file. Huruf kunci lowercase. */
export const EXTRACTABLE_EXTENSIONS: Record<string, ExtractableFileType> = {
  ".pdf": "PDF",
  ".docx": "DOCX",
  ".txt": "TXT",
};

/** Label untuk ditampilkan di UI. */
export const FILE_TYPE_LABEL: Record<ExtractableFileType, string> = {
  PDF: "PDF",
  DOCX: "DOCX",
  TXT: "TXT",
};

/**
 * Deteksi tipe file dari ekstensi nama file.
 * Mengembalikan null bila ekstensi tidak didukung.
 */
export function detectFileType(fileName: string): ExtractableFileType | null {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0) return null;
  return EXTRACTABLE_EXTENSIONS[fileName.slice(dot).toLowerCase()] ?? null;
}
