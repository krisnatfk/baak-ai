/**
 * Validasi & pemetaan nilai import FAQ (status/audiens) — pure, mudah diuji.
 *
 * Tidak menyentuh DB. Pemanggil (server action) menyediakan himpunan nama
 * kategori existing (lowercase) agar bisa menandai "kategori belum ditemukan"
 * sebagai WARNING (admin memilih: petakan / buat baru / lewati).
 */

import { AUDIENCE_VALUES, type Audience } from "@/db/constants";
import type { ParsedFaqRow } from "./import-parser";

/** Nilai status knowledge (enum existing — tidak membuat enum baru). */
export type KnowledgeStatus = "DRAFT" | "ACTIVE" | "INACTIVE" | "NEEDS_REVIEW";

export type ImportRowStatus = "VALID" | "WARNING" | "ERROR" | "DUPLICATE";

export interface ValidatedFaqRow {
  rowNumber: number;
  parsed: ParsedFaqRow;
  status: ImportRowStatus;
  message: string;
  /** Nilai status hasil pemetaan (null bila invalid). */
  mappedStatus: KnowledgeStatus | null;
  /** Nilai audiens hasil pemetaan (null bila invalid). */
  mappedAudience: Audience | null;
  /** Nama kategori (trim) — untuk resolusi di preview. */
  categoryName: string;
  /** true bila kategori belum ada di DB. */
  categoryUnknown: boolean;
}

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/[\s]+/g, "_");
}

const STATUS_ALIASES: Record<string, KnowledgeStatus> = {
  draft: "DRAFT",
  draf: "DRAFT",
  active: "ACTIVE",
  aktif: "ACTIVE",
  published: "ACTIVE",
  publish: "ACTIVE",
  terbit: "ACTIVE",
  inactive: "INACTIVE",
  nonaktif: "INACTIVE",
  non_aktif: "INACTIVE",
  archived: "INACTIVE",
  archive: "INACTIVE",
  arsip: "INACTIVE",
  needs_review: "NEEDS_REVIEW",
  perlu_review: "NEEDS_REVIEW",
  review: "NEEDS_REVIEW",
};

/** Nilai status kanonikal + label untuk template/export. */
export const STATUS_CANONICAL: KnowledgeStatus[] = [
  "DRAFT",
  "ACTIVE",
  "INACTIVE",
  "NEEDS_REVIEW",
];

export function mapStatus(raw: string): KnowledgeStatus | null {
  if (!raw || raw.trim() === "") return null;
  return STATUS_ALIASES[norm(raw)] ?? null;
}

const AUDIENCE_ALIASES: Record<string, Audience> = {
  mahasiswa: "MAHASISWA",
  calon_mahasiswa: "CALON_MAHASISWA",
  alumni: "ALUMNI",
  orang_tua: "ORANG_TUA",
  umum: "UMUM",
  public: "UMUM",
  general: "UMUM",
};

export function mapAudience(raw: string): Audience | null {
  if (!raw || raw.trim() === "") return null;
  const n = norm(raw);
  if ((AUDIENCE_VALUES as readonly string[]).includes(n)) {
    return n as Audience;
  }
  return AUDIENCE_ALIASES[n] ?? null;
}

export interface ValidateContext {
  /** Nama kategori existing (lowercase) untuk deteksi "belum ditemukan". */
  categories: Set<string>;
}

/**
 * Validasi satu baris. Status ERROR bila wajib kosong/invalid; WARNING bila
 * kategori belum ada (perlu resolusi admin). Tidak melakukan dedup (layer
 * terpisah di duplicate.ts).
 */
export function validateFaqRow(
  row: ParsedFaqRow,
  ctx: ValidateContext,
): ValidatedFaqRow {
  const mappedStatus = mapStatus(row.status);
  const mappedAudience = mapAudience(row.audience);
  const categoryName = row.category.trim();

  const errors: string[] = [];
  if (!row.question.trim()) errors.push("Pertanyaan wajib diisi.");
  if (!row.answer.trim()) errors.push("Jawaban wajib diisi.");
  if (!categoryName) errors.push("Kategori wajib diisi.");
  if (!mappedAudience) {
    errors.push(`Audiens "${row.audience}" tidak valid.`);
  }
  if (row.status.trim() && !mappedStatus) {
    errors.push(`Status "${row.status}" tidak valid.`);
  }

  if (errors.length > 0) {
    return {
      rowNumber: row.rowNumber,
      parsed: row,
      status: "ERROR",
      message: errors.join(" "),
      mappedStatus,
      mappedAudience,
      categoryName,
      categoryUnknown: false,
    };
  }

  const categoryUnknown = !ctx.categories.has(categoryName.toLowerCase());
  if (categoryUnknown) {
    return {
      rowNumber: row.rowNumber,
      parsed: row,
      status: "WARNING",
      message: `Kategori "${categoryName}" belum ditemukan.`,
      mappedStatus,
      mappedAudience,
      categoryName,
      categoryUnknown: true,
    };
  }

  return {
    rowNumber: row.rowNumber,
    parsed: row,
    status: "VALID",
    message: "",
    mappedStatus: mappedStatus ?? "DRAFT",
    mappedAudience,
    categoryName,
    categoryUnknown: false,
  };
}
