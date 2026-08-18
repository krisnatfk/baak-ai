/**
 * Ekspor FAQ (XLSX/CSV) dan pembuatan template XLSX — server-only.
 *
 * Format ekspor MENGIKUTI struktur import (kolom yang sama) sehingga alur
 * Export → edit → Import berjalan. Template memuat beberapa sheet: FAQ Import
 * (header + data CONTOH), Petunjuk, Master Kategori, Master Audiens,
 * Master Status.
 */

import ExcelJS from "exceljs";
import Papa from "papaparse";
import { AUDIENCE_VALUES } from "@/db/constants";
import {
  FAQ_IMPORT_COLUMNS,
  ARRAY_SEPARATOR,
} from "./import-parser";
import { STATUS_CANONICAL } from "./import-validate";

/** Header kolom (urutan kanonikal). */
export const EXPORT_HEADERS: string[] = [...FAQ_IMPORT_COLUMNS];

/** Satu baris FAQ yang sudah diflatkan untuk ekspor/import. */
export interface ExportFaqRow {
  question: string;
  answer: string;
  category: string;
  audience: string;
  status: string;
  keywords: string[];
  referenceUrl: string;
  primarySource: string;
  officialSources: { title: string; url: string }[];
  relatedQuestions: string[];
  alternativeQuestions: string[];
  media: { caption: string; url: string }[];
  attachments: { title: string; type: string; url: string }[];
  internalNote: string;
}

/** Flatten satu ExportFaqRow → array string (urut sesuai EXPORT_HEADERS). */
export function exportRowToCells(row: ExportFaqRow): string[] {
  return [
    row.question,
    row.answer,
    row.category,
    row.audience,
    row.status,
    row.keywords.join(` ${ARRAY_SEPARATOR} `),
    row.referenceUrl,
    row.primarySource,
    row.officialSources
      .map((s) => (s.url ? `${s.title}|${s.url}` : s.title))
      .join(` ${ARRAY_SEPARATOR} `),
    row.relatedQuestions.join(` ${ARRAY_SEPARATOR} `),
    row.alternativeQuestions.join(` ${ARRAY_SEPARATOR} `),
    row.media
      .map((m) => (m.url ? `${m.caption}|${m.url}` : m.caption))
      .join(` ${ARRAY_SEPARATOR} `),
    row.attachments
      .map((a) => `${a.title}|${a.type}|${a.url}`)
      .join(` ${ARRAY_SEPARATOR} `),
    row.internalNote,
  ];
}

/** Buat buffer XLSX dari header + baris data. */
export async function buildXlsxBuffer(
  sheetName: string,
  headers: string[],
  rows: string[][],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  sheet.getRow(1).font = { bold: true };
  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/** Ekspor CSV dari header + baris data (pakai papaparse unparse). */
export function buildCsv(headers: string[], rows: string[][]): string {
  return Papa.unparse([headers, ...rows]);
}

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

const DEMO_ROWS: ExportFaqRow[] = [
  {
    question: "[CONTOH] Bagaimana cara mendaftar PKL?",
    answer:
      "Mahasiswa mengajukan surat permohonan PKL ke BAAK dengan melampirkan KHS dan transkrip.",
    category: "PKL",
    audience: "MAHASISWA",
    status: "DRAFT",
    keywords: ["PKL", "magang", "pendaftaran"],
    referenceUrl: "",
    primarySource: "Panduan PKL",
    officialSources: [
      { title: "Panduan PKL", url: "https://baak.example.ac.id/pkl" },
    ],
    relatedQuestions: ["Apa syarat PKL?"],
    alternativeQuestions: ["Gimana cara daftar PKL?", "Cara ngajuin PKL gimana?"],
    media: [{ caption: "Alur pendaftaran", url: "https://baak.example.ac.id/img/pkl.png" }],
    attachments: [
      {
        title: "Formulir PKL",
        type: "PDF",
        url: "https://baak.example.ac.id/files/form-pkl.pdf",
      },
    ],
    internalNote: "Verifikasi syarat terbaru sebelum dipublikasikan.",
  },
  {
    question: "[CONTOH] Kapan batas akhir pengajuan cuti akademik?",
    answer: "Pengajuan cuti paling lambat dua minggu sebelum masa registrasi.",
    category: "Akademik",
    audience: "MAHASISWA",
    status: "DRAFT",
    keywords: ["cuti", "akademik"],
    referenceUrl: "",
    primarySource: "Buku Pedoman Akademik",
    officialSources: [],
    relatedQuestions: [],
    alternativeQuestions: ["Deadline cuti kapan?"],
    media: [],
    attachments: [],
    internalNote: "",
  },
];

/** Build workbook template (multi-sheet). */
export async function buildTemplateBuffer(categories: string[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  // Sheet 1 — FAQ Import.
  const data = workbook.addWorksheet("FAQ Import");
  data.addRow(EXPORT_HEADERS);
  data.getRow(1).font = { bold: true };
  for (const demo of DEMO_ROWS) {
    data.addRow(exportRowToCells(demo));
  }
  data.columns.forEach((col, i) => {
    const widths = [40, 60, 15, 15, 15, 30, 30, 20, 40, 40, 40, 40, 40, 30];
    col.width = widths[i] ?? 20;
  });

  // Sheet 2 — Petunjuk.
  const guide = workbook.addWorksheet("Petunjuk");
  const lines = [
    ["PANDUAN IMPORT FAQ"],
    [],
    ["1. Isi baris data pada sheet 'FAQ Import'. Kolom wajib: question, answer, category, audience, status."],
    ["2. Kolom bernilai banyak memakai separator '||' (mis. keywords: 'PKL || magang')."],
    ["3. Format nilai khusus:"],
    ["   - official_sources : Judul|https://... (pisahkan tiap sumber dengan '||')."],
    ["   - media            : Caption|https://..."],
    ["   - attachments      : Judul|PDF|https://..."],
    ["4. Baris bertanda '[CONTOH]' adalah contoh — HAPUS SEBELUM IMPORT."],
    ["5. Status yang valid: DRAFT, ACTIVE, INACTIVE, NEEDS_REVIEW (lihat sheet Master Status)."],
    ["6. Audiens yang valid: MAHASISWA, CALON_MAHASISWA, ALUMNI, ORANG_TUA, UMUM."],
    ["7. Kategori harus sudah ada di Master Kategori, atau gunakan resolusi saat preview import."],
    ["8. FAQ hasil import berstatus DRAFT (kecuali Anda memilih ACTIVE) dan menunggu embedding."],
  ];
  for (const line of lines) guide.addRow(line);
  guide.getCell("A1").font = { bold: true };
  guide.columns[0].width = 100;

  // Sheet 3 — Master Kategori.
  const catSheet = workbook.addWorksheet("Master Kategori");
  catSheet.addRow(["name"]);
  catSheet.getRow(1).font = { bold: true };
  for (const name of categories) catSheet.addRow([name]);
  catSheet.columns[0].width = 40;

  // Sheet 4 — Master Audiens.
  const audSheet = workbook.addWorksheet("Master Audiens");
  audSheet.addRow(["audience"]);
  audSheet.getRow(1).font = { bold: true };
  for (const a of AUDIENCE_VALUES) audSheet.addRow([a]);
  audSheet.columns[0].width = 24;

  // Sheet 5 — Master Status.
  const statusSheet = workbook.addWorksheet("Master Status");
  statusSheet.addRow(["status", "keterangan"]);
  statusSheet.getRow(1).font = { bold: true };
  const statusLabels: Record<string, string> = {
    DRAFT: "Belum dipublikasikan (default import)",
    ACTIVE: "Dipublikasikan (dilayani RAG)",
    INACTIVE: "Diarsipkan",
    NEEDS_REVIEW: "Perlu review admin",
  };
  for (const s of STATUS_CANONICAL) {
    statusSheet.addRow([s, statusLabels[s] ?? ""]);
  }
  statusSheet.columns[0].width = 24;
  statusSheet.columns[1].width = 50;

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}
