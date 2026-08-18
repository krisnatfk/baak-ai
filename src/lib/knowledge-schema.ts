/**
 * Skema zod untuk formulir knowledge base (kategori, sumber, FAQ).
 *
 * Modul ini TIDAK boleh mengimpor apa pun dari server (`@/db/client`,
 * `@/lib/env`, `server-only`). Dipakai bersama oleh:
 *  - Server Action (validasi ulang sisi server) di knowledge.ts, dan
 *  - komponen form client (validasi real-time via zodResolver).
 */

import { z } from "zod";
import { AUDIENCE_VALUES } from "@/db/constants";

export const categorySchema = z.object({
  name: z.string().trim().min(2, "Nama minimal 2 karakter.").max(150),
  description: z.string().trim().max(2000, "Maksimal 2000 karakter.").default(""),
  color: z.string().trim().max(20, "Maksimal 20 karakter.").default(""),
  isActive: z.boolean().default(true),
  /** Tampil di menu bot (GET /api/bot/menu). */
  showInBotMenu: z.boolean().default(false),
});
export type CategoryFormValues = z.infer<typeof categorySchema>;
/**
 * Tipe INPUT skema: field dengan `.default()` menjadi opsional.
 * react-hook-form + zodResolver v4 memakai tipe ini sebagai generic useForm.
 */
export type CategoryFormInput = z.input<typeof categorySchema>;

export const sourceSchema = z.object({
  title: z.string().trim().min(2, "Judul minimal 2 karakter.").max(255),
  type: z.enum(["MANUAL", "URL", "PDF", "DOCX", "TXT"]),
  url: z
    .union([z.string().trim().url("URL tidak valid."), z.literal("")])
    .optional()
    .default(""),
  description: z.string().trim().max(2000, "Maksimal 2000 karakter.").default(""),
  isActive: z.boolean().default(true),
});
export type SourceFormValues = z.infer<typeof sourceSchema>;
/** Tipe INPUT skema — lihat CategoryFormInput. */
export type SourceFormInput = z.input<typeof sourceSchema>;

// ---------------------------------------------------------------------------
// Sumber Resmi PER-FAQ (bagian B formulir FAQ)
// ---------------------------------------------------------------------------

export const faqItemSourceSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Judul sumber minimal 2 karakter.")
    .max(255, "Maksimal 255 karakter."),
  type: z.enum(["WEBSITE", "DOCUMENT", "INTERNAL", "OTHER"]),
  url: z
    .union([z.string().trim().url("URL tidak valid."), z.literal("")])
    .default(""),
});
export type FaqItemSourceValues = z.infer<typeof faqItemSourceSchema>;

// ---------------------------------------------------------------------------
// Pertanyaan Terkait (bagian C formulir FAQ) — dipilih admin, bukan LLM
// ---------------------------------------------------------------------------

export const faqRelatedQuestionSchema = z
  .object({
    relatedKnowledgeId: z
      .string()
      .uuid("FAQ terkait tidak valid.")
      .optional()
      .nullable(),
    /** Snapshot judul FAQ terkait, atau teks bebas yang divalidasi admin. */
    question: z.string().trim().max(1000, "Maksimal 1000 karakter.").default(""),
  })
  .refine(
    (value) => value.relatedKnowledgeId != null || value.question.trim().length > 0,
    {
      message: "Pilih FAQ terkait atau tulis pertanyaan terkait.",
      path: ["question"],
    },
  );
export type FaqRelatedQuestionValues = z.infer<typeof faqRelatedQuestionSchema>;

// ---------------------------------------------------------------------------
// Media FAQ (bagian D formulir) — gambar/URL eksternal, bukan base64
// ---------------------------------------------------------------------------
// Setiap baris media punya salah satu: file upload (hasFile + File via FormData)
// ATAU URL eksternal. Untuk baris lama (edit), filePath/fileName/... dibawa
// balik lewat form agar tidak perlu diunggah ulang.

export const faqMediaSchema = z
  .object({
    /** ID baris lama (edit) — null untuk media baru. */
    existingId: z.string().uuid("ID media tidak valid.").optional().nullable(),
    type: z.enum(["IMAGE", "VIDEO", "OTHER"]).default("IMAGE"),
    caption: z.string().trim().max(1000, "Maksimal 1000 karakter.").default(""),
    url: z
      .union([z.string().trim().url("URL tidak valid."), z.literal("")])
      .default(""),
    filePath: z.string().trim().max(500).optional().nullable(),
    fileName: z.string().trim().max(255).optional().nullable(),
    fileSize: z.number().int().nonnegative().optional().nullable(),
    mimeType: z.string().trim().max(100).optional().nullable(),
    /** true bila ada file baru menyertai baris ini (di-upload via FormData). */
    hasFile: z.boolean().default(false),
  })
  .refine(
    (value) =>
      value.hasFile || value.filePath != null || value.url.trim().length > 0,
    {
      message: "Unggah gambar atau isi URL media.",
      path: ["url"],
    },
  );
export type FaqMediaValues = z.infer<typeof faqMediaSchema>;

// ---------------------------------------------------------------------------
// Lampiran FAQ (bagian E formulir) — file PDF/DOC/DOCX/XLS/XLSX
// ---------------------------------------------------------------------------

export const faqAttachmentSchema = z
  .object({
    existingId: z.string().uuid("ID lampiran tidak valid.").optional().nullable(),
    title: z
      .string()
      .trim()
      .min(2, "Judul lampiran minimal 2 karakter.")
      .max(255, "Maksimal 255 karakter."),
    type: z.enum(["PDF", "DOC", "DOCX", "XLS", "XLSX", "OTHER"]).default("PDF"),
    filePath: z.string().trim().max(500).optional().nullable(),
    fileName: z.string().trim().max(255).optional().nullable(),
    fileSize: z.number().int().nonnegative().optional().nullable(),
    mimeType: z.string().trim().max(100).optional().nullable(),
    hasFile: z.boolean().default(false),
  })
  .refine((value) => value.hasFile || value.filePath != null, {
    message: "Unggah file lampiran.",
    path: ["title"],
  });
export type FaqAttachmentValues = z.infer<typeof faqAttachmentSchema>;

export const faqFormSchema = z.object({
  question: z
    .string()
    .trim()
    .min(5, "Pertanyaan minimal 5 karakter.")
    .max(1000, "Maksimal 1000 karakter."),
  answer: z
    .string()
    .trim()
    .min(1, "Jawaban wajib diisi.")
    .max(20000, "Maksimal 20000 karakter."),
  categoryId: z.string().uuid("Kategori tidak valid.").optional().nullable(),
  audience: z.enum(AUDIENCE_VALUES),
  keywords: z.array(z.string().trim().min(1)).max(30).default([]),
  sourceId: z.string().uuid("Sumber tidak valid.").optional().nullable(),
  sourceUrl: z
    .union([z.string().trim().url("URL tidak valid."), z.literal("")])
    .optional()
    .default(""),
  status: z.enum(["DRAFT", "ACTIVE", "INACTIVE", "NEEDS_REVIEW"]),
  internalNote: z.string().trim().max(4000, "Maksimal 4000 karakter.").default(""),
  alternatives: z
    .array(
      z.object({
        question: z
          .string()
          .trim()
          .min(3, "Pertanyaan alternatif minimal 3 karakter.")
          .max(1000),
      }),
    )
    .max(20)
    .default([]),
  /** Sumber Resmi PER-FAQ (bagian B). */
  sources: z.array(faqItemSourceSchema).max(20).default([]),
  /** Pertanyaan Terkait (bagian C) — dipilih admin dari FAQ aktif / teks bebas. */
  relatedQuestions: z.array(faqRelatedQuestionSchema).max(20).default([]),
  /** Media (bagian D) — gambar upload atau URL eksternal + caption. */
  media: z.array(faqMediaSchema).max(20).default([]),
  /** Lampiran (bagian E) — file PDF/DOC/DOCX/XLS/XLSX + judul. */
  attachments: z.array(faqAttachmentSchema).max(20).default([]),
});
export type FaqFormValues = z.infer<typeof faqFormSchema>;
/** Tipe INPUT skema — lihat CategoryFormInput. */
export type FaqFormInput = z.input<typeof faqFormSchema>;
