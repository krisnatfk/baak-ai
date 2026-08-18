/**
 * Parser file bulk import FAQ (XLSX / CSV) — server-only, pure (mudah diuji).
 *
 * - Kolom diidentifikasi dari baris header (nama kanonikal Inggris; alias
 *   Indonesia diterima).
 * - Kolom bernilai banyak memakai separator `||` (lihat docs/FAQ_BULK_IMPORT.md).
 * - Semua nilai dibaca sebagai string; field kosong → "" / array kosong.
 * - TIDAK menyentuh database / network (validasi & dedup di layer terpisah).
 */

import ExcelJS from "exceljs";
import JSZip from "jszip";
import Papa from "papaparse";

/** Separator untuk kolom bernilai banyak (dokumen resmi BAAK). */
export const ARRAY_SEPARATOR = "||";

/** Kolom kanonikal (urutan = urutan header template). */
export const FAQ_IMPORT_COLUMNS = [
  "question",
  "answer",
  "category",
  "audience",
  "status",
  "keywords",
  "reference_url",
  "primary_source",
  "official_sources",
  "related_questions",
  "alternative_questions",
  "media",
  "attachments",
  "internal_note",
  "source_document",
  "source_page",
  "validation_status",
  "confidence",
] as const;

export type FaqImportColumn = (typeof FAQ_IMPORT_COLUMNS)[number];

/** Alias header (normalisasi lowercase + spasi→underscore) → kolom kanonikal. */
const HEADER_ALIASES: Record<string, FaqImportColumn> = {
  // Bahasa Indonesia (mengikuti pemetaan spesifikasi).
  pertanyaan: "question",
  jawaban: "answer",
  kategori: "category",
  audiens: "audience",
  status: "status",
  kata_kunci: "keywords",
  url_rujukan: "reference_url",
  sumber: "primary_source",
  sumber_resmi: "official_sources",
  pertanyaan_terkait: "related_questions",
  pertanyaan_alternatif: "alternative_questions",
  media: "media",
  lampiran: "attachments",
  catatan_internal: "internal_note",
  dokumen_sumber: "source_document",
  halaman_sumber: "source_page",
  status_validasi: "validation_status",
  keyakinan: "confidence",
};

export interface ParsedSourceRef {
  title: string;
  url: string;
}

export interface ParsedMediaRef {
  caption: string;
  url: string;
}

export interface ParsedAttachmentRef {
  title: string;
  type: string;
  url: string;
}

/** Satu baris FAQ hasil parse (belum divalidasi). */
export interface ParsedFaqRow {
  /** Nomor baris file (1-based, header = 1). */
  rowNumber: number;
  question: string;
  answer: string;
  category: string;
  audience: string;
  status: string;
  keywords: string[];
  referenceUrl: string;
  primarySource: string;
  officialSources: ParsedSourceRef[];
  relatedQuestions: string[];
  alternativeQuestions: string[];
  media: ParsedMediaRef[];
  attachments: ParsedAttachmentRef[];
  internalNote: string;
  sourceDocument: string;
  sourcePage: string;
  validationStatus: string;
  confidence: string;
}

export class FaqImportParseError extends Error {}

function normalizeHeader(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s]+/g, "_");
}

/** Petakan nama header → kolom kanonikal (null bila bukan kolom dikenal). */
function resolveHeader(raw: string): FaqImportColumn | null {
  const key = normalizeHeader(raw);
  if (!key) return null;
  if ((FAQ_IMPORT_COLUMNS as readonly string[]).includes(key)) {
    return key as FaqImportColumn;
  }
  return HEADER_ALIASES[key] ?? null;
}

function cellToString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.text === "string") return o.text.trim();
    if (typeof o.result === "string" || typeof o.result === "number") {
      return String(o.result);
    }
    if (typeof o.hyperlink === "string") return o.hyperlink.trim();
    if (Array.isArray(o.richText)) {
      return (o.richText as Array<{ text?: string }>)
        .map((r) => r.text ?? "")
        .join("");
    }
    return String(o);
  }
  return String(value);
}

/** Pecah string multi-nilai dengan separator `||`, buang bagian kosong. */
export function splitList(value: string): string[] {
  if (!value || value.trim() === "") return [];
  return value
    .split(ARRAY_SEPARATOR)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** Parse satu entri `Title|url` (official_sources). */
function parseTitleUrl(entry: string): ParsedSourceRef {
  const [title, url = ""] = entry.split("|");
  return { title: title.trim(), url: url.trim() };
}

/** Parse satu entri media `Caption|url`. */
function parseCaptionUrl(entry: string): ParsedMediaRef {
  const [caption, url = ""] = entry.split("|");
  return { caption: caption.trim(), url: url.trim() };
}

/** Parse satu entri lampiran `Title|type|url` (type boleh kosong). */
function parseAttachment(entry: string): ParsedAttachmentRef {
  const parts = entry.split("|");
  const title = (parts[0] ?? "").trim();
  const type = (parts[1] ?? "").trim();
  const url = (parts[2] ?? "").trim();
  return { title, type, url };
}

/**
 * Parse buffer file import (XLSX atau CSV) menjadi array ParsedFaqRow.
 * Baris header pertama menentukan pemetaan kolom; baris data yang seluruhnya
 * kosong dilewati. Melempar FaqImportParseError bila format tidak dikenali.
 */
export async function parseFaqImportFile(
  buffer: Buffer,
  fileName: string,
): Promise<ParsedFaqRow[]> {
  if (!buffer || buffer.length === 0) {
    throw new FaqImportParseError("File kosong — tidak ada data untuk dibaca.");
  }

  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  const rows: string[][] =
    ext === "csv" ? parseCsv(buffer) : await parseXlsx(buffer);

  if (rows.length === 0) {
    throw new FaqImportParseError("File kosong — tidak ada baris data.");
  }

  const header = rows[0];
  const columnMap = new Map<number, FaqImportColumn>();
  for (let i = 0; i < header.length; i++) {
    const col = resolveHeader(header[i]);
    if (col) columnMap.set(i, col);
  }

  if (![...columnMap.values()].includes("question")) {
    throw new FaqImportParseError(
      'Kolom wajib "question" tidak ditemukan di baris header.',
    );
  }
  if (![...columnMap.values()].includes("answer")) {
    throw new FaqImportParseError(
      'Kolom wajib "answer" tidak ditemukan di baris header.',
    );
  }

  const parsed: ParsedFaqRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const raw = rows[r];
    if (raw.every((cell) => cell.trim() === "")) continue;

    const get = (col: FaqImportColumn): string => {
      for (const [idx, c] of columnMap) {
        if (c === col) return (raw[idx] ?? "").trim();
      }
      return "";
    };

    const rowNumber = r + 1; // 1-based termasuk header
    parsed.push({
      rowNumber,
      question: get("question"),
      answer: get("answer"),
      category: get("category"),
      audience: get("audience"),
      status: get("status"),
      keywords: splitList(get("keywords")),
      referenceUrl: get("reference_url"),
      primarySource: get("primary_source"),
      officialSources: splitList(get("official_sources")).map(parseTitleUrl),
      relatedQuestions: splitList(get("related_questions")),
      alternativeQuestions: splitList(get("alternative_questions")),
      media: splitList(get("media")).map(parseCaptionUrl),
      attachments: splitList(get("attachments")).map(parseAttachment),
      internalNote: get("internal_note"),
      sourceDocument: get("source_document"),
      sourcePage: get("source_page"),
      validationStatus: get("validation_status"),
      confidence: get("confidence"),
    });
  }

  return parsed;
}

/** Parse CSV → array baris (baris pertama = header). */
function parseCsv(buffer: Buffer): string[][] {
  const text = buffer.toString("utf8");
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: "greedy",
    // header:false → hasil berupa array of array.
  });
  const data = result.data as string[][];
  if (result.errors && result.errors.length > 0) {
    const first = result.errors[0];
    if (first && first.code === "MissingQuotes") {
      // Peringatan ringan — lanjutkan dengan data yang terbaca.
    }
  }
  return data.map((row) => row.map((c) => (c == null ? "" : String(c).trim())));
}

/**
 * Namespace utama spreadsheet OOXML — prefix yang terikat ke namespace ini
 * (mis. `x:`) dibuang saat normalisasi agar ExcelJS dapat membaca file.
 */
const SPREADSHEETML_NS_URI =
  "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

/**
 * Baca Workbook exceljs dari buffer XLSX.
 *
 * Beberapa generator XLSX (mis. WPS Office / exporter lain) menulis seluruh
 * elemen dengan prefix namespace, contoh `<x:workbook>`, `<x:sheet>`,
 * `<x:row>`. ExcelJS (saxes tanpa pemrosesan namespace) membaca nama elemen
 * apa adanya sehingga `x:workbook` tidak dikenali sebagai `workbook`;
 * `parseWorkbook` lalu mengembalikan undefined dan load gagal dengan
 * "Cannot read properties of undefined (reading 'sheets')".
 *
 * Solusi: bila load pertama gagal, normalisasi zip dengan membuang prefix
 * yang terikat ke namespace spreadsheetml (atribut seperti `r:id` dibiarkan),
 * lalu muat ulang. Jika normalisasi tidak membantu, error asli dilempar ulang.
 */
async function readXlsxWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    return wb;
  } catch (err) {
    const normalized = await normalizeXlsxNamespacePrefixes(buffer);
    if (!normalized) throw err;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(normalized as unknown as ArrayBuffer);
    return wb;
  }
}

/**
 * Buang prefix namespace spreadsheetml dari nama elemen di seluruh bagian
 * XML/rels XLSX. Mengembalikan buffer baru, atau null bila tidak ada yang
 * perlu dinormalisasi / gagal dibaca ulang sebagai zip.
 */
async function normalizeXlsxNamespacePrefixes(
  buffer: Buffer,
): Promise<Buffer | null> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const out = new JSZip();
    let changed = false;
    for (const name of Object.keys(zip.files)) {
      const entry = zip.files[name];
      if (entry.dir) continue;
      let content = await entry.async("nodebuffer");
      if (name.endsWith(".xml") || name.endsWith(".rels")) {
        const text = content.toString("utf8");
        const prefix = findSpreadsheetmlPrefix(text);
        if (prefix) {
          const re = new RegExp(`</?${escapeRegExp(prefix)}:`, "g");
          const stripped = text.replace(re, (m) =>
            m.startsWith("</") ? "</" : "<",
          );
          content = Buffer.from(stripped, "utf8");
          changed = true;
        }
      }
      out.file(name, content);
    }
    return changed ? await out.generateAsync({ type: "nodebuffer" }) : null;
  } catch (err) {
    console.error("[faq-import] Gagal menormalkan prefix namespace XLSX:", err);
    return null;
  }
}

/** Prefix yang dideklarasikan untuk namespace spreadsheetml (mis. `x`). */
function findSpreadsheetmlPrefix(xml: string): string | null {
  const re = /xmlns:([A-Za-z_][\w.-]*)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (m[2] === SPREADSHEETML_NS_URI) return m[1];
  }
  return null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Parse XLSX → array baris (baris pertama = header).
 *
 * Menggunakan Workbook in-memory normal (BUKAN ExcelJS.stream.xlsx.WorkbookReader
 * — streaming reader rusak pada Node >= 18 dan menghasilkan
 * "Cannot read properties of undefined (reading 'sheets')"). File bulk import
 * maksimal hanya beberapa ribu FAQ sehingga in-memory sudah memadai.
 */
async function parseXlsx(buffer: Buffer): Promise<string[][]> {
  let workbook: ExcelJS.Workbook;
  try {
    workbook = await readXlsxWorkbook(buffer);
  } catch (err) {
    const e = err as Error;
    // Log detail teknis (tanpa secret) untuk memudahkan debugging.
    console.error("[faq-import] Gagal membaca file XLSX:", {
      name: e?.name,
      message: e?.message,
      stack: e?.stack,
    });
    throw new FaqImportParseError(
      "Gagal membaca file XLSX. Pastikan file menggunakan format .xlsx dan sheet 'FAQ Import' tersedia.",
    );
  }

  const sheet =
    workbook.getWorksheet("FAQ Import") ?? workbook.worksheets[0];
  if (!sheet) {
    throw new FaqImportParseError(
      "Workbook tidak memiliki worksheet yang dapat dibaca.",
    );
  }

  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      cells.push(cellToString(cell.value));
    });
    // Pangkas sel kosong di ekor baris.
    while (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
    rows.push(cells);
  });

  // Hapus baris yang seluruhnya kosong (jika ada di antara).
  return rows.filter((row) => row.some((c) => c.trim() !== ""));
}
