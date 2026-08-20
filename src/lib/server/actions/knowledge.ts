/**
 * Server Actions — manajemen knowledge base (kategori, sumber, FAQ).
 *
 * Semua mutasi:
 *  - divalidasi zod (parameterized, aman dari injection),
 *  - dilindungi role (ADMIN/SUPER_ADMIN; VIEWER read-only),
 *  - dicatat ke audit_logs,
 *  - menyetel embedding_status=PENDING saat konten embedding berubah
 *    (worker embedding di Phase 4 memproses antrian PENDING → COMPLETED/FAILED).
 */

"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { and, eq, isNull, asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  EMBEDDING_TEXT_VERSION,
  knowledgeAlternativeQuestions,
  knowledgeAttachments,
  knowledgeCategories,
  knowledgeDocuments,
  knowledgeItemSources,
  knowledgeItems,
  knowledgeMedia,
  knowledgeRelatedQuestions,
  knowledgeSources,
  unansweredQuestions,
} from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { requireRole } from "@/lib/guards";
import {
  categorySchema,
  faqFormSchema,
  sourceSchema,
  type FaqFormValues,
} from "@/lib/knowledge-schema";
import {
  MediaUploadError,
  saveAttachmentFile,
  saveImageFile,
  type SavedAttachmentFile,
  type SavedMediaFile,
} from "@/lib/server/media-upload";
import {
  removeLocalUploadFile,
  resolveLocalUploadPath,
} from "@/lib/server/upload-storage";
import { runBestEffortPostCommitCleanup } from "@/lib/server/upload-lifecycle";
import { embeddingFieldsChanged } from "@/services/embedding/changed";
import { processEmbeddingQueue } from "@/services/embedding/worker";
import { type ActionResult, fail, isUniqueViolation, ok, zodFail } from "./shared";

// Backward-compat: komponen client mengimpor ActionResult dari file ini.
export type { ActionResult } from "./shared";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // buang aksen
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 150);
}

// Predikat perubahan konten embedding dipakai bersama skrip integrasi
// (Test E/F) — lihat src/services/embedding/changed.ts.

/**
 * Jalankan antrian embedding setelah mutasi FAQ. Dipanggil fire-and-forget
 * (gagal tidak menggagalkan aksi utama; error dicatat di log).
 */
async function runEmbeddingQueueAfterSave(): Promise<void> {
  try {
    await processEmbeddingQueue();
  } catch (err) {
    console.error("[knowledge] Gagal memproses antrian embedding:", err);
  }
}

// ---------------------------------------------------------------------------
// Helper submit FAQ + media/lampiran (FormData)
// ---------------------------------------------------------------------------

/** Error yang membawa hasil validasi zod (untuk zodFail). */
class FaqParseError extends Error {
  constructor(public zodError?: z.ZodError) {
    super("Data FAQ tidak valid.");
  }
}

interface ParsedFaqSubmission {
  data: FaqFormValues;
  /** File media yang baru disimpan ke disk per baris (null bila baris tanpa file). */
  savedMedia: (SavedMediaFile | null)[];
  /** File lampiran yang baru disimpan ke disk per baris (null bila baris tanpa file). */
  savedAttachments: (SavedAttachmentFile | null)[];
}

/**
 * Baca FormData submit FAQ:
 *  - field `data`      → JSON payload (divalidasi faqFormSchema),
 *  - `media_<i>`       → File gambar untuk baris media ke-i (bila hasFile),
 *  - `attachment_<i>`  → File lampiran untuk baris lampiran ke-i (bila hasFile).
 *
 * File divalidasi magic-bytes + ukuran (saveImageFile/saveAttachmentFile)
 * dan disimpan ke disk SEBELUM transaksi; bila transaksi gagal, pemanggil
 * bertanggung jawab membersihkannya (cleanupSavedFiles).
 */
async function parseFaqFormData(
  formData: FormData,
  allowedExistingPaths: Set<string> = new Set(),
): Promise<ParsedFaqSubmission> {
  const raw = formData.get("data");
  if (typeof raw !== "string") throw new FaqParseError();

  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    throw new FaqParseError();
  }
  const parsed = faqFormSchema.safeParse(input);
  if (!parsed.success) throw new FaqParseError(parsed.error);
  const data = parsed.data;

  const savedMedia: (SavedMediaFile | null)[] = [];
  const savedAttachments: (SavedAttachmentFile | null)[] = [];
  const submission = { data, savedMedia, savedAttachments };
  try {
    for (let i = 0; i < data.media.length; i++) {
      if (!data.media[i].hasFile) {
        const retainedPath = data.media[i].filePath;
        if (retainedPath && !isAllowedExistingPath(retainedPath, allowedExistingPaths)) {
          throw new MediaUploadError(
            "Referensi file media tidak valid. Unggah ulang file.",
          );
        }
        savedMedia.push(null);
        continue;
      }
      const file = formData.get(`media_${i}`);
      if (!(file instanceof File) || file.size === 0) {
        throw new MediaUploadError("File media tidak ditemukan.");
      }
      savedMedia.push(await saveImageFile(file));
    }

    for (let i = 0; i < data.attachments.length; i++) {
      if (!data.attachments[i].hasFile) {
        const retainedPath = data.attachments[i].filePath;
        if (retainedPath && !isAllowedExistingPath(retainedPath, allowedExistingPaths)) {
          throw new MediaUploadError(
            "Referensi file lampiran tidak valid. Unggah ulang file.",
          );
        }
        savedAttachments.push(null);
        continue;
      }
      const file = formData.get(`attachment_${i}`);
      if (!(file instanceof File) || file.size === 0) {
        throw new MediaUploadError("File lampiran tidak ditemukan.");
      }
      savedAttachments.push(await saveAttachmentFile(file));
    }

    return submission;
  } catch (error) {
    await cleanupSavedFiles(submission);
    throw error;
  }
}

/** Hapus file dari disk — hanya path di dalam UPLOAD_DIR (cegah traversal). */
function isAllowedExistingPath(filePath: string, allowedPaths: Set<string>): boolean {
  const target = resolveLocalUploadPath(filePath);
  if (!target) return false;
  for (const allowed of allowedPaths) {
    if (resolveLocalUploadPath(allowed) === target) return true;
  }
  return false;
}

async function removeStoredFileQuietly(filePath: string): Promise<void> {
  try {
    const target = resolveLocalUploadPath(filePath);
    if (!target) return;
    await removeLocalUploadFile(filePath);
  } catch {
    // File mungkin sudah tidak ada — abaikan.
  }
}

/** Hapus file lama hanya bila tidak direferensikan tabel upload mana pun. */
async function removeStoredFileIfUnreferenced(filePath: string): Promise<void> {
  const target = resolveLocalUploadPath(filePath);
  if (!target) return;

  const [mediaRows, attachmentRows, documentRows] = await Promise.all([
    db.select({ filePath: knowledgeMedia.filePath }).from(knowledgeMedia),
    db.select({ filePath: knowledgeAttachments.filePath }).from(knowledgeAttachments),
    db.select({ filePath: knowledgeDocuments.filePath }).from(knowledgeDocuments),
  ]);
  const isReferenced = [...mediaRows, ...attachmentRows, ...documentRows].some(
    (row) => row.filePath && resolveLocalUploadPath(row.filePath) === target,
  );
  if (!isReferenced) await removeLocalUploadFile(filePath);
}

/**
 * Cleanup setelah commit tidak boleh menggagalkan action atau menghapus file
 * baru yang sudah direferensikan DB. Error hanya dicatat tanpa detail rahasia.
 */
async function cleanupObsoleteStoredFile(
  filePath: string,
  type: "media" | "attachment",
  faqId: string,
): Promise<void> {
  await runBestEffortPostCommitCleanup(
    () => removeStoredFileIfUnreferenced(filePath),
    (error) => {
      console.warn(
        `[UPLOAD_CLEANUP_FAILED] ${JSON.stringify({
          type,
          faqId,
          filePath,
          error: error instanceof Error ? error.name : "UnknownError",
        })}`,
      );
    },
  );
}

/** Bersihkan file yang baru disimpan bila transaksi FAQ gagal. */
async function cleanupSavedFiles(submission: ParsedFaqSubmission): Promise<void> {
  for (const saved of submission.savedMedia) {
    if (saved) await removeStoredFileQuietly(saved.filePath);
  }
  for (const saved of submission.savedAttachments) {
    if (saved) await removeStoredFileQuietly(saved.filePath);
  }
}

/** Baris knowledge_media untuk insert (file baru / baris lama / URL eksternal). */
function buildMediaRows(
  knowledgeId: string,
  submission: ParsedFaqSubmission,
): (typeof knowledgeMedia.$inferInsert)[] {
  const rows: (typeof knowledgeMedia.$inferInsert)[] = [];
  submission.data.media.forEach((m, i) => {
    const saved = submission.savedMedia[i];
    if (saved) {
      rows.push({
        knowledgeId,
        type: "IMAGE",
        caption: m.caption || null,
        url: m.url || null,
        filePath: saved.filePath,
        fileName: saved.fileName,
        fileSize: saved.fileSize,
        mimeType: saved.mimeType,
        sortOrder: i,
      });
      return;
    }
    if (m.filePath) {
      // Baris lama (edit) — pertahankan metadata aslinya.
      rows.push({
        knowledgeId,
        type: m.type,
        caption: m.caption || null,
        url: m.url || null,
        filePath: m.filePath,
        fileName: m.fileName ?? null,
        fileSize: m.fileSize ?? null,
        mimeType: m.mimeType ?? null,
        sortOrder: i,
      });
      return;
    }
    // URL eksternal.
    rows.push({
      knowledgeId,
      type: m.type,
      caption: m.caption || null,
      url: m.url || null,
      filePath: null,
      fileName: null,
      fileSize: null,
      mimeType: null,
      sortOrder: i,
    });
  });
  return rows;
}

/** Baris knowledge_attachments untuk insert (file baru / baris lama). */
function buildAttachmentRows(
  knowledgeId: string,
  submission: ParsedFaqSubmission,
): (typeof knowledgeAttachments.$inferInsert)[] {
  return submission.data.attachments.map((a, i): typeof knowledgeAttachments.$inferInsert => {
    const saved = submission.savedAttachments[i];
    if (saved) {
      return {
        knowledgeId,
        title: a.title,
        type: saved.kind,
        filePath: saved.filePath,
        url: a.url || null,
        fileName: saved.fileName,
        fileSize: saved.fileSize,
        mimeType: saved.mimeType,
        sortOrder: i,
      };
    }
    // Baris lama (edit) — filePath dijamin ada oleh skema.
    return {
      knowledgeId,
      title: a.title,
      type: a.type,
      filePath: a.filePath ?? null,
      url: a.url || null,
      fileName: a.fileName ?? a.title,
      fileSize: a.fileSize ?? 0,
      mimeType: a.mimeType ?? null,
      sortOrder: i,
    };
  });
}

/** Kumpulkan semua filePath yang masih terpakai oleh data submit. */
function collectUsedFilePaths(submission: ParsedFaqSubmission): Set<string> {
  const used = new Set<string>();
  for (const [index, media] of submission.data.media.entries()) {
    if (!submission.savedMedia[index] && media.filePath) used.add(media.filePath);
  }
  for (const [index, attachment] of submission.data.attachments.entries()) {
    if (!submission.savedAttachments[index] && attachment.filePath) {
      used.add(attachment.filePath);
    }
  }
  for (const saved of submission.savedMedia) {
    if (saved) used.add(saved.filePath);
  }
  for (const saved of submission.savedAttachments) {
    if (saved) used.add(saved.filePath);
  }
  return used;
}

// ---------------------------------------------------------------------------
// Skema validasi (berbagi dengan komponen form client — lihat knowledge-schema.ts)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Kategori
// ---------------------------------------------------------------------------

export async function createCategory(
  input: unknown,
): Promise<ActionResult> {
  const user = await requireRole("ADMIN", "SUPER_ADMIN");
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const data = parsed.data;

  const slug = slugify(data.name);
  try {
    const [row] = await db
      .insert(knowledgeCategories)
      .values({
        name: data.name,
        slug,
        description: data.description || null,
        color: data.color || null,
        isActive: data.isActive,
        createdBy: user.id,
        updatedBy: user.id,
      })
      .returning({ id: knowledgeCategories.id });

    await logAudit({
      user,
      action: "CREATE",
      entity: "CATEGORY",
      entityId: row.id,
      newData: { name: data.name, slug, description: data.description },
    });
    revalidatePath("/knowledge/categories");
    return ok("Kategori berhasil dibuat.", row.id);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return fail("Nama kategori sudah ada.");
    }
    throw error;
  }
}

export async function updateCategory(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const user = await requireRole("ADMIN", "SUPER_ADMIN");
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const data = parsed.data;

  const existing = await db.query.knowledgeCategories.findFirst({
    where: eq(knowledgeCategories.id, id),
  });
  if (!existing) return fail("Kategori tidak ditemukan.");

  const slug = slugify(data.name);
  try {
    const [row] = await db
      .update(knowledgeCategories)
      .set({
        name: data.name,
        slug,
        description: data.description || null,
        color: data.color || null,
        isActive: data.isActive,
        updatedBy: user.id,
        updatedAt: new Date(),
      })
      .where(eq(knowledgeCategories.id, id))
      .returning({ id: knowledgeCategories.id });

    await logAudit({
      user,
      action: "UPDATE",
      entity: "CATEGORY",
      entityId: row.id,
      oldData: { name: existing.name, description: existing.description, isActive: existing.isActive },
      newData: { name: data.name, description: data.description, isActive: data.isActive },
    });
    revalidatePath("/knowledge/categories");
    return ok("Kategori berhasil diperbarui.", row.id);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return fail("Nama kategori sudah dipakai kategori lain.");
    }
    throw error;
  }
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  const user = await requireRole("ADMIN", "SUPER_ADMIN");
  const existing = await db.query.knowledgeCategories.findFirst({
    where: eq(knowledgeCategories.id, id),
  });
  if (!existing) return fail("Kategori tidak ditemukan.");

  // Cegah penghapusan bila masih dipakai FAQ (biarkan tanpa kategori saja).
  const used = await db.$count(
    knowledgeItems,
    and(eq(knowledgeItems.categoryId, id), isNull(knowledgeItems.deletedAt)),
  );
  if (used > 0) {
    return fail(
      `Kategori masih dipakai ${used} FAQ. Nonaktifkan kategori alih-alih menghapus.`,
    );
  }

  await db.delete(knowledgeCategories).where(eq(knowledgeCategories.id, id));
  await logAudit({
    user,
    action: "DELETE",
    entity: "CATEGORY",
    entityId: id,
    oldData: { name: existing.name, slug: existing.slug },
  });
  revalidatePath("/knowledge/categories");
  return ok("Kategori dihapus.");
}

export async function setCategoryActive(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  const user = await requireRole("ADMIN", "SUPER_ADMIN");
  const existing = await db.query.knowledgeCategories.findFirst({
    where: eq(knowledgeCategories.id, id),
  });
  if (!existing) return fail("Kategori tidak ditemukan.");

  await db
    .update(knowledgeCategories)
    .set({ isActive, updatedBy: user.id, updatedAt: new Date() })
    .where(eq(knowledgeCategories.id, id));
  await logAudit({
    user,
    action: isActive ? "ACTIVATE" : "DEACTIVATE",
    entity: "CATEGORY",
    entityId: id,
    oldData: { isActive: existing.isActive },
    newData: { isActive },
  });
  revalidatePath("/knowledge/categories");
  return ok(isActive ? "Kategori diaktifkan." : "Kategori dinonaktifkan.");
}

// ---------------------------------------------------------------------------
// Sumber (knowledge sources)
// ---------------------------------------------------------------------------

export async function createSource(input: unknown): Promise<ActionResult> {
  const user = await requireRole("ADMIN", "SUPER_ADMIN");
  const parsed = sourceSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const data = parsed.data;

  const [row] = await db
    .insert(knowledgeSources)
    .values({
      title: data.title,
      type: data.type,
      url: data.url || null,
      description: data.description || null,
      isActive: data.isActive,
      createdBy: user.id,
      updatedBy: user.id,
    })
    .returning({ id: knowledgeSources.id });

  await logAudit({
    user,
    action: "CREATE",
    entity: "SOURCE",
    entityId: row.id,
    newData: { title: data.title, type: data.type, url: data.url },
  });
  revalidatePath("/knowledge/sources");
  return ok("Sumber berhasil dibuat.", row.id);
}

export async function updateSource(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const user = await requireRole("ADMIN", "SUPER_ADMIN");
  const parsed = sourceSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const data = parsed.data;

  const existing = await db.query.knowledgeSources.findFirst({
    where: eq(knowledgeSources.id, id),
  });
  if (!existing) return fail("Sumber tidak ditemukan.");

  const [row] = await db
    .update(knowledgeSources)
    .set({
      title: data.title,
      type: data.type,
      url: data.url || null,
      description: data.description || null,
      isActive: data.isActive,
      updatedBy: user.id,
      updatedAt: new Date(),
    })
    .where(eq(knowledgeSources.id, id))
    .returning({ id: knowledgeSources.id });

  await logAudit({
    user,
    action: "UPDATE",
    entity: "SOURCE",
    entityId: row.id,
    oldData: { title: existing.title, type: existing.type, isActive: existing.isActive },
    newData: { title: data.title, type: data.type, isActive: data.isActive },
  });
  revalidatePath("/knowledge/sources");
  return ok("Sumber berhasil diperbarui.", row.id);
}

export async function deleteSource(id: string): Promise<ActionResult> {
  const user = await requireRole("ADMIN", "SUPER_ADMIN");
  const existing = await db.query.knowledgeSources.findFirst({
    where: eq(knowledgeSources.id, id),
  });
  if (!existing) return fail("Sumber tidak ditemukan.");

  const used = await db.$count(
    knowledgeItems,
    and(eq(knowledgeItems.sourceId, id), isNull(knowledgeItems.deletedAt)),
  );
  if (used > 0) {
    return fail(
      `Sumber masih dipakai ${used} FAQ. Nonaktifkan sumber alih-alih menghapus.`,
    );
  }

  await db.delete(knowledgeSources).where(eq(knowledgeSources.id, id));
  await logAudit({
    user,
    action: "DELETE",
    entity: "SOURCE",
    entityId: id,
    oldData: { title: existing.title },
  });
  revalidatePath("/knowledge/sources");
  return ok("Sumber dihapus.");
}

export async function setSourceActive(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  const user = await requireRole("ADMIN", "SUPER_ADMIN");
  const existing = await db.query.knowledgeSources.findFirst({
    where: eq(knowledgeSources.id, id),
  });
  if (!existing) return fail("Sumber tidak ditemukan.");

  await db
    .update(knowledgeSources)
    .set({ isActive, updatedBy: user.id, updatedAt: new Date() })
    .where(eq(knowledgeSources.id, id));
  await logAudit({
    user,
    action: isActive ? "ACTIVATE" : "DEACTIVATE",
    entity: "SOURCE",
    entityId: id,
    oldData: { isActive: existing.isActive },
    newData: { isActive },
  });
  revalidatePath("/knowledge/sources");
  return ok(isActive ? "Sumber diaktifkan." : "Sumber dinonaktifkan.");
}

// ---------------------------------------------------------------------------
// FAQ (knowledge items)
// ---------------------------------------------------------------------------

/** Ambil FAQ termasuk kolom embedding lama (untuk cek perubahan). */
async function getFaqForUpdate(id: string) {
  return db.query.knowledgeItems.findFirst({
    where: and(eq(knowledgeItems.id, id), isNull(knowledgeItems.deletedAt)),
    columns: {
      id: true,
      question: true,
      answer: true,
      categoryId: true,
      audience: true,
      keywords: true,
      sourceId: true,
      sourceUrl: true,
      status: true,
      internalNote: true,
      embeddingStatus: true,
      embedding: true,
      embeddingError: true,
      embeddingModel: true,
      embeddingTextVersion: true,
    },
  });
}

/**
 * Buat FAQ baru.
 *
 * Bila `unansweredId` diberikan (dari alur "Tambahkan ke Knowledge Base"),
 * pertanyaan tidak terjawab terkait ditandai ADDED_TO_KNOWLEDGE dan ditautkan
 * ke FAQ yang baru dibuat — semua dalam satu transaksi.
 */
export async function createFaq(
  formData: FormData,
  unansweredId?: string,
): Promise<ActionResult> {
  const user = await requireRole("ADMIN", "SUPER_ADMIN");

  // Baca + validasi payload, simpan file media/lampiran ke disk.
  let submission: ParsedFaqSubmission;
  try {
    submission = await parseFaqFormData(formData);
  } catch (error) {
    if (error instanceof FaqParseError && error.zodError) {
      return zodFail(error.zodError);
    }
    if (error instanceof MediaUploadError) return fail(error.message);
    throw error;
  }
  const data = submission.data;

  try {
    const result = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(knowledgeItems)
        .values({
          question: data.question,
          answer: data.answer,
          categoryId: data.categoryId ?? null,
          audience: data.audience,
          keywords: data.keywords,
          sourceId: data.sourceId ?? null,
          sourceUrl: data.sourceUrl || null,
          status: data.status,
          internalNote: data.internalNote || null,
          showInMainMenu: data.showInMainMenu,
          mainMenuOrder: data.mainMenuOrder ?? null,
          // Embedding harus diproses worker.
          embeddingStatus: "PENDING",
          embeddingError: null,
          embedding: null,
          embeddingModel: null,
          embeddingTextVersion: EMBEDDING_TEXT_VERSION,
          createdBy: user.id,
          updatedBy: user.id,
        })
        .returning({ id: knowledgeItems.id });

      if (data.alternatives.length > 0) {
        await tx.insert(knowledgeAlternativeQuestions).values(
          data.alternatives.map((a) => ({
            knowledgeId: row.id,
            question: a.question,
          })),
        );
      }

      // Sumber Resmi per-FAQ (bagian B).
      if (data.sources.length > 0) {
        await tx.insert(knowledgeItemSources).values(
          data.sources.map((s, index) => ({
            knowledgeId: row.id,
            title: s.title,
            type: s.type,
            url: s.url || null,
            sortOrder: index,
          })),
        );
      }

      // Pertanyaan Terkait (bagian C) — dipilih admin, bukan LLM.
      if (data.relatedQuestions.length > 0) {
        await tx.insert(knowledgeRelatedQuestions).values(
          data.relatedQuestions.map((r, index) => ({
            knowledgeId: row.id,
            relatedKnowledgeId: r.relatedKnowledgeId ?? null,
            question: r.question || null,
            sortOrder: index,
          })),
        );
      }

      // Media (bagian D) — file upload atau URL eksternal.
      if (data.media.length > 0) {
        const rows = buildMediaRows(row.id, submission);
        if (rows.length > 0) await tx.insert(knowledgeMedia).values(rows);
      }

      // Lampiran (bagian E) — file PDF/DOC/DOCX/XLS/XLSX.
      if (data.attachments.length > 0) {
        const rows = buildAttachmentRows(row.id, submission);
        if (rows.length > 0) await tx.insert(knowledgeAttachments).values(rows);
      }

      // Tautkan pertanyaan tidak terjawab (alur auto-fill).
      if (unansweredId) {
        const pending = await tx.query.unansweredQuestions.findFirst({
          where: eq(unansweredQuestions.id, unansweredId),
        });
        if (pending) {
          await tx
            .update(unansweredQuestions)
            .set({
              status: "ADDED_TO_KNOWLEDGE",
              knowledgeId: row.id,
              reviewedAt: new Date(),
              reviewedBy: user.id,
            })
            .where(eq(unansweredQuestions.id, unansweredId));
          await logAudit({
            user,
            action: "REVIEW",
            entity: "UNANSWERED",
            entityId: unansweredId,
            oldData: { status: pending.status },
            newData: { status: "ADDED_TO_KNOWLEDGE", knowledgeId: row.id },
          });
        }
      }

      await logAudit({
        user,
        action: "CREATE",
        entity: "FAQ",
        entityId: row.id,
        newData: {
          question: data.question,
          status: data.status,
          audience: data.audience,
          keywords: data.keywords,
        },
      });
      revalidatePath("/knowledge/faq");
      revalidatePath("/unanswered");
      return ok("FAQ berhasil dibuat dan antre untuk di-embedding.", row.id);
    });

    // Proses embedding antrean segera (fire-and-forget, tidak memblokir respons).
    await runEmbeddingQueueAfterSave();
    return result;
  } catch (error) {
    // Transaksi gagal → buang file yang baru saja disimpan ke disk.
    await cleanupSavedFiles(submission);
    if (isUniqueViolation(error)) {
      return fail(
        "Pertanyaan yang sama sudah ada di knowledge base (tidak boleh duplikat).",
      );
    }
    throw error;
  }
}

export async function updateFaq(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireRole("ADMIN", "SUPER_ADMIN");

  // Cek target dan daftar path lama sebelum menulis file baru ke disk.
  const existing = await getFaqForUpdate(id);
  if (!existing) return fail("FAQ tidak ditemukan.");
  const [oldMediaPaths, oldAttachmentPaths] = await Promise.all([
    db
      .select({ filePath: knowledgeMedia.filePath })
      .from(knowledgeMedia)
      .where(eq(knowledgeMedia.knowledgeId, id)),
    db
      .select({ filePath: knowledgeAttachments.filePath })
      .from(knowledgeAttachments)
      .where(eq(knowledgeAttachments.knowledgeId, id)),
  ]);
  const allowedExistingPaths = new Set(
    [...oldMediaPaths, ...oldAttachmentPaths]
      .map((row) => row.filePath)
      .filter((filePath): filePath is string => Boolean(filePath)),
  );

  // Baca + validasi payload, simpan file media/lampiran baru ke disk.
  let submission: ParsedFaqSubmission;
  try {
    submission = await parseFaqFormData(formData, allowedExistingPaths);
  } catch (error) {
    if (error instanceof FaqParseError && error.zodError) {
      return zodFail(error.zodError);
    }
    if (error instanceof MediaUploadError) return fail(error.message);
    throw error;
  }
  const data = submission.data;

  // File lama yang tidak lagi dipakai formulir → dihapus dari disk setelah
  // transaksi berhasil (hindari file yatim).
  const usedPaths = collectUsedFilePaths(submission);

  const embeddingChanged =
    existing.embeddingStatus === "FAILED" ||
    embeddingFieldsChanged(existing, data);

  let result: ActionResult;
  try {
    result = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(knowledgeItems)
        .set({
          question: data.question,
          answer: data.answer,
          categoryId: data.categoryId ?? null,
          audience: data.audience,
          keywords: data.keywords,
          sourceId: data.sourceId ?? null,
          sourceUrl: data.sourceUrl || null,
          status: data.status,
          internalNote: data.internalNote || null,
          showInMainMenu: data.showInMainMenu,
          mainMenuOrder: data.mainMenuOrder ?? null,
          updatedBy: user.id,
          updatedAt: new Date(),
          ...(embeddingChanged
            ? {
                embeddingStatus: "PENDING",
                embeddingError: null,
                embedding: null,
                embeddingModel: null,
                embeddingTextVersion: EMBEDDING_TEXT_VERSION,
              }
            : {}),
        })
        .where(and(eq(knowledgeItems.id, id), isNull(knowledgeItems.deletedAt)))
        .returning({ id: knowledgeItems.id });

      // Ganti seluruh daftar pertanyaan alternatif.
      await tx
        .delete(knowledgeAlternativeQuestions)
        .where(eq(knowledgeAlternativeQuestions.knowledgeId, id));
      if (data.alternatives.length > 0) {
        await tx.insert(knowledgeAlternativeQuestions).values(
          data.alternatives.map((a) => ({
            knowledgeId: id,
            question: a.question,
          })),
        );
      }

      // Ganti seluruh daftar Sumber Resmi per-FAQ.
      await tx
        .delete(knowledgeItemSources)
        .where(eq(knowledgeItemSources.knowledgeId, id));
      if (data.sources.length > 0) {
        await tx.insert(knowledgeItemSources).values(
          data.sources.map((s, index) => ({
            knowledgeId: id,
            title: s.title,
            type: s.type,
            url: s.url || null,
            sortOrder: index,
          })),
        );
      }

      // Ganti seluruh daftar Pertanyaan Terkait.
      await tx
        .delete(knowledgeRelatedQuestions)
        .where(eq(knowledgeRelatedQuestions.knowledgeId, id));
      if (data.relatedQuestions.length > 0) {
        await tx.insert(knowledgeRelatedQuestions).values(
          data.relatedQuestions.map((r, index) => ({
            knowledgeId: id,
            relatedKnowledgeId: r.relatedKnowledgeId ?? null,
            question: r.question || null,
            sortOrder: index,
          })),
        );
      }

      // Ganti seluruh daftar Media (bagian D).
      await tx
        .delete(knowledgeMedia)
        .where(eq(knowledgeMedia.knowledgeId, id));
      const mediaRows = buildMediaRows(id, submission);
      if (mediaRows.length > 0) {
        await tx.insert(knowledgeMedia).values(mediaRows);
      }

      // Ganti seluruh daftar Lampiran (bagian E).
      await tx
        .delete(knowledgeAttachments)
        .where(eq(knowledgeAttachments.knowledgeId, id));
      const attachmentRows = buildAttachmentRows(id, submission);
      if (attachmentRows.length > 0) {
        await tx.insert(knowledgeAttachments).values(attachmentRows);
      }

      await logAudit({
        user,
        action: embeddingChanged ? "UPDATE" : "STATUS_CHANGE",
        entity: "FAQ",
        entityId: row.id,
        oldData: {
          question: existing.question,
          status: existing.status,
          embeddingStatus: existing.embeddingStatus,
        },
        newData: {
          question: data.question,
          status: data.status,
          embeddingStatus: embeddingChanged ? "PENDING" : existing.embeddingStatus,
        },
      });
      revalidatePath("/knowledge/faq");
      return ok("FAQ berhasil diperbarui.", row.id);
    });
  } catch (error) {
    // Hanya kegagalan sebelum/selama commit DB yang boleh menghapus file baru.
    await cleanupSavedFiles(submission);
    if (isUniqueViolation(error)) {
      return fail(
        "Pertanyaan yang sama sudah ada di FAQ lain (tidak boleh duplikat).",
      );
    }
    throw error;
  }

  if (embeddingChanged) {
      // Konten embedding berubah → proses antrean ulang.
    await runEmbeddingQueueAfterSave();
  }

    // Hapus file lama yang tidak lagi terpakai (di luar transaksi — kegagalan
    // penghapusan file tidak boleh membatalkan update DB).
  for (const row of oldMediaPaths) {
    if (row.filePath && !usedPaths.has(row.filePath)) {
      await cleanupObsoleteStoredFile(row.filePath, "media", id);
    }
  }
  for (const row of oldAttachmentPaths) {
    if (row.filePath && !usedPaths.has(row.filePath)) {
      await cleanupObsoleteStoredFile(row.filePath, "attachment", id);
    }
  }
  return result;
}

export async function deleteFaq(id: string): Promise<ActionResult> {
  const user = await requireRole("ADMIN", "SUPER_ADMIN");
  const existing = await getFaqForUpdate(id);
  if (!existing) return fail("FAQ tidak ditemukan.");

  await db
    .update(knowledgeItems)
    .set({ deletedAt: new Date(), updatedBy: user.id, updatedAt: new Date() })
    .where(eq(knowledgeItems.id, id));

  await logAudit({
    user,
    action: "DELETE",
    entity: "FAQ",
    entityId: id,
    oldData: { question: existing.question, status: existing.status },
  });
  revalidatePath("/knowledge/faq");
  return ok("FAQ dihapus (soft delete).");
}

/** Ulangi proses embedding untuk FAQ yang statusnya FAILED/PENDING. */
export async function retryEmbedding(id: string): Promise<ActionResult> {
  const user = await requireRole("ADMIN", "SUPER_ADMIN");
  const existing = await getFaqForUpdate(id);
  if (!existing) return fail("FAQ tidak ditemukan.");

  await db
    .update(knowledgeItems)
    .set({
      embeddingStatus: "PENDING",
      embeddingError: null,
      embedding: null,
      embeddingTextVersion: EMBEDDING_TEXT_VERSION,
      updatedBy: user.id,
      updatedAt: new Date(),
    })
    .where(eq(knowledgeItems.id, id));

  await logAudit({
    user,
    action: "RETRY_EMBEDDING",
    entity: "FAQ",
    entityId: id,
    oldData: { embeddingStatus: existing.embeddingStatus },
    newData: { embeddingStatus: "PENDING" },
  });
  revalidatePath("/knowledge/faq");

  // Proses embedding antrean segera (fire-and-forget).
  await runEmbeddingQueueAfterSave();
  return ok("FAQ diantrekan ulang untuk embedding.");
}

export async function getMenuPreviewAction() {
  const pmbCategory = await db.query.knowledgeCategories.findFirst({
    where: eq(knowledgeCategories.slug, "pmb"),
    columns: { id: true },
  });

  if (!pmbCategory) {
    return { success: true, menu: [] };
  }

  const items = await db.query.knowledgeItems.findMany({
    where: and(
      eq(knowledgeItems.categoryId, pmbCategory.id),
      eq(knowledgeItems.status, "ACTIVE"),
      eq(knowledgeItems.showInMainMenu, true),
      isNull(knowledgeItems.deletedAt)
    ),
    orderBy: [asc(knowledgeItems.mainMenuOrder), asc(knowledgeItems.id)],
    columns: {
      id: true,
      question: true,
      mainMenuOrder: true,
    }
  });

  const menu = items.map((it) => ({
    id: it.id,
    question: it.question,
    menuOrder: it.mainMenuOrder,
  }));

  return { success: true, menu };
}
