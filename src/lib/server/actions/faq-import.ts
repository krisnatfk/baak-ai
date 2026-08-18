/**
 * Server Actions — bulk import FAQ, generate FAQ dari dokumen, bulk action,
 * drain embedding, dan rollback.
 *
 * Semua mutasi:
 *  - dilindungi role (ADMIN/SUPER_ADMIN; VIEWER read-only),
 *  - divalidasi zod,
 *  - dicatat ke audit_logs,
 *  - menyetel embedding_status=PENDING agar worker embedding memprosesnya.
 */

"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  EMBEDDING_TEXT_VERSION,
  faqImportBatches,
  faqImportRows,
  knowledgeAlternativeQuestions,
  knowledgeAttachments,
  knowledgeCategories,
  knowledgeDocumentChunks,
  knowledgeDocuments,
  knowledgeItemSources,
  knowledgeItems,
  knowledgeMedia,
  knowledgeRelatedQuestions,
  knowledgeSources,
} from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { requireRole } from "@/lib/guards";
import {
  FaqImportParseError,
  parseFaqImportFile,
  type ParsedFaqRow,
} from "@/services/faq/import-parser";
import {
  mapAudience,
  mapStatus,
  validateFaqRow,
  type KnowledgeStatus,
} from "@/services/faq/import-validate";
import { detectDuplicates } from "@/services/faq/duplicate";
import { generateCandidatesForChunk } from "@/services/faq/generate";
import { processEmbeddingQueue } from "@/services/embedding/worker";
import { type ActionResult, fail, ok, zodFail } from "./shared";

export type { ActionResult } from "./shared";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function buildBatchCode(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = randomBytes(3).toString("hex");
  return `IMP-${y}${m}${day}-${rand}`;
}

function slugifyCategory(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 150);
}

async function runEmbeddingQueueAfterSave(): Promise<void> {
  try {
    await processEmbeddingQueue();
  } catch (err) {
    console.error("[faq-import] Gagal memproses antrian embedding:", err);
  }
}

// ---------------------------------------------------------------------------
// Tipe hasil preview
// ---------------------------------------------------------------------------

export interface PreviewCounts {
  total: number;
  valid: number;
  warning: number;
  error: number;
  duplicate: number;
}

export interface PreviewResult {
  ok: true;
  batchId: string;
  batchCode: string;
  counts: PreviewCounts;
}

type RowStatus = "VALID" | "WARNING" | "ERROR" | "DUPLICATE";

// ---------------------------------------------------------------------------
// Preview import (parse → validate → dedup → simpan staging)
// ---------------------------------------------------------------------------

export async function previewFaqImport(
  formData: FormData,
): Promise<ActionResult | PreviewResult> {
  const user = await requireRole("ADMIN", "SUPER_ADMIN");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return fail("Pilih file XLSX atau CSV terlebih dahulu.");
  }
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (ext !== "xlsx" && ext !== "csv") {
    return fail("Format tidak didukung. Gunakan .xlsx atau .csv.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let rows: ParsedFaqRow[];
  try {
    rows = await parseFaqImportFile(buffer, file.name);
  } catch (err) {
    if (err instanceof FaqImportParseError) return fail(err.message);
    return fail("Gagal membaca file import.");
  }
  if (rows.length === 0) return fail("File tidak berisi baris data.");

  const categories = await db
    .select({ name: knowledgeCategories.name })
    .from(knowledgeCategories);
  const categorySet = new Set(categories.map((c) => c.name.toLowerCase()));

  const validated = rows.map((r) => validateFaqRow(r, { categories: categorySet }));
  const dupMap = await detectDuplicates(rows);

  let valid = 0;
  let warning = 0;
  let error = 0;
  let duplicate = 0;

  const classified: RowStatus[] = validated.map((v) => {
    if (v.status === "ERROR") {
      error++;
      return "ERROR";
    }
    if (dupMap.has(v.rowNumber)) {
      duplicate++;
      return "DUPLICATE";
    }
    if (v.status === "WARNING") {
      warning++;
      return "WARNING";
    }
    valid++;
    return "VALID";
  });

  const batchCode = buildBatchCode();

  const batchId = await db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(faqImportBatches)
      .values({
        batchCode,
        fileName: file.name,
        fileType: ext.toUpperCase(),
        status: "PROCESSING",
        totalRows: rows.length,
        validCount: valid,
        warningCount: warning,
        errorCount: error,
        duplicateCount: duplicate,
        createdBy: user.id,
      })
      .returning({ id: faqImportBatches.id });

    await tx.insert(faqImportRows).values(
      validated.map((v, i) => {
        const hit = dupMap.get(v.rowNumber);
        return {
          batchId: batch.id,
          rowIndex: v.rowNumber,
          data: v.parsed as unknown as Record<string, unknown>,
          validationStatus: classified[i],
          message: v.message || null,
          duplicateOf: hit
            ? JSON.stringify({
                kind: hit.kind,
                matchedId: hit.matchedId,
                matchedQuestion: hit.matchedQuestion,
                score: hit.score ?? null,
              })
            : null,
        };
      }),
    );
    return batch.id;
  });

  await logAudit({
    user,
    action: "IMPORT",
    entity: "IMPORT_BATCH",
    entityId: batchId,
    newData: {
      batchCode,
      fileName: file.name,
      total: rows.length,
      valid,
      warning,
      error,
      duplicate,
    },
  });

  revalidatePath("/knowledge/faq/import-history");
  return {
    ok: true,
    batchId,
    batchCode,
    counts: { total: rows.length, valid, warning, error, duplicate },
  };
}

// ---------------------------------------------------------------------------
// Commit import
// ---------------------------------------------------------------------------

const categoryResolutionSchema = z.object({
  action: z.enum(["map", "create", "skip"]),
  categoryId: z.string().uuid().optional().nullable(),
});
const duplicateResolutionSchema = z.object({
  action: z.enum(["skip", "import_anyway", "merge", "replace"]),
});

const commitSchema = z.object({
  batchId: z.string().uuid("Batch tidak valid."),
  categories: z.record(z.string(), categoryResolutionSchema).default({}),
  duplicates: z.record(z.string(), duplicateResolutionSchema).default({}),
});

interface DuplicateMeta {
  kind: "EXACT" | "SEMANTIC";
  matchedId: string | null;
  matchedQuestion: string;
  score: number | null;
}

function parseDuplicateMeta(raw: string | null): DuplicateMeta | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as DuplicateMeta;
    if (o && o.kind) return o;
  } catch {
    /* ignore */
  }
  return null;
}

const ATTACHMENT_TYPE_MAP: Record<string, string> = {
  pdf: "PDF",
  doc: "DOC",
  docx: "DOCX",
  xls: "XLS",
  xlsx: "XLSX",
  "application/pdf": "PDF",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "DOCX",
  "application/vnd.ms-excel": "XLS",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
};

function mapAttachmentType(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/\./g, "");
  return ATTACHMENT_TYPE_MAP[key] ?? "OTHER";
}

export async function commitFaqImport(input: unknown): Promise<ActionResult> {
  const user = await requireRole("ADMIN", "SUPER_ADMIN");
  const parsed = commitSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const { batchId, categories: catRes, duplicates: dupRes } = parsed.data;

  const batch = await db.query.faqImportBatches.findFirst({
    where: eq(faqImportBatches.id, batchId),
  });
  if (!batch) return fail("Batch import tidak ditemukan.");
  if (batch.status !== "PROCESSING") {
    return fail("Batch ini sudah diproses atau di-rollback.");
  }

  const staging = await db.query.faqImportRows.findMany({
    where: eq(faqImportRows.batchId, batchId),
    orderBy: (t, { asc }) => asc(t.rowIndex),
  });

  // Kategori existing + sumber existing (untuk resolusi name → id).
  const [categories, sources] = await Promise.all([
    db
      .select({ id: knowledgeCategories.id, name: knowledgeCategories.name })
      .from(knowledgeCategories),
    db
      .select({ id: knowledgeSources.id, title: knowledgeSources.title })
      .from(knowledgeSources),
  ]);
  const categoryByName = new Map(
    categories.map((c) => [c.name.toLowerCase(), c.id]),
  );
  const sourceByName = new Map(
    sources.map((s) => [s.title.toLowerCase(), s.id]),
  );

  // Kategori baru yang akan dibuat saat commit (action=create).
  const createdCategoryByName = new Map<string, string>();

  let importedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let mergedCount = 0;
  let replacedCount = 0;

  const parents: (typeof knowledgeItems.$inferInsert)[] = [];
  const children: {
    question: string;
    alternatives: string[];
    sources: { title: string; url: string }[];
    related: string[];
    media: { caption: string; url: string }[];
    attachments: { title: string; type: string; url: string }[];
  }[] = [];

  for (const row of staging) {
    const data = row.data as unknown as ParsedFaqRow;

    if (row.validationStatus === "ERROR") {
      skippedCount++;
      continue;
    }

    // ---- Duplikat ----
    if (row.validationStatus === "DUPLICATE") {
      const meta = parseDuplicateMeta(row.duplicateOf);
      const action = dupRes[String(row.rowIndex)]?.action ?? "skip";
      if (action === "merge" && meta?.matchedId) {
        await db.insert(knowledgeAlternativeQuestions).values(
          [data.question, ...data.alternativeQuestions].map((q) => ({
            knowledgeId: meta.matchedId!,
            question: q,
          })),
        );
        mergedCount++;
        continue;
      }
      if (action === "replace" && meta?.matchedId) {
        await db
          .update(knowledgeItems)
          .set({
            answer: data.answer,
            keywords: data.keywords,
            embeddingStatus: "PENDING",
            embedding: null,
            embeddingError: null,
            embeddingTextVersion: EMBEDDING_TEXT_VERSION,
            updatedBy: user.id,
            updatedAt: new Date(),
          })
          .where(eq(knowledgeItems.id, meta.matchedId));
        replacedCount++;
        continue;
      }
      if (action !== "import_anyway" || (meta && meta.kind === "EXACT")) {
        // Exact duplicate tidak bisa di-import (unique index) — hanya skip/merge/replace.
        skippedCount++;
        continue;
      }
      // Semantic duplicate + import_anyway → lanjut sebagai import biasa.
    }

    // ---- Kategori (warning: belum ditemukan) ----
    let categoryId: string | null = null;
    const catName = data.category.trim();
    if (catName) {
      const existingId = categoryByName.get(catName.toLowerCase());
      if (existingId) {
        categoryId = existingId;
      } else if (createdCategoryByName.has(catName.toLowerCase())) {
        categoryId = createdCategoryByName.get(catName.toLowerCase())!;
      } else {
        const res = catRes[catName] ?? { action: "skip" };
        if (res.action === "create") {
          const [created] = await db
            .insert(knowledgeCategories)
            .values({
              name: catName,
              slug: slugifyCategory(catName),
              isActive: true,
              createdBy: user.id,
              updatedBy: user.id,
            })
            .onConflictDoNothing()
            .returning({ id: knowledgeCategories.id });
          categoryId = created?.id ?? categoryByName.get(catName.toLowerCase()) ?? null;
          if (categoryId) createdCategoryByName.set(catName.toLowerCase(), categoryId);
        } else if (res.action === "map" && res.categoryId) {
          categoryId = res.categoryId;
        } else {
          // skip (tidak di-resolve) → lewati baris.
          skippedCount++;
          continue;
        }
      }
    }

    const sourceId = data.primarySource
      ? sourceByName.get(data.primarySource.toLowerCase()) ?? null
      : null;

    parents.push({
      question: data.question,
      answer: data.answer,
      categoryId,
      audience: mapAudience(data.audience) ?? "MAHASISWA",
      keywords: data.keywords,
      sourceId,
      sourceUrl: data.referenceUrl || null,
      status: finalStatus(data),
      internalNote: data.internalNote || null,
      importBatchId: batchId,
      embeddingStatus: "PENDING",
      embedding: null,
      embeddingError: null,
      embeddingModel: null,
      embeddingTextVersion: EMBEDDING_TEXT_VERSION,
      createdBy: user.id,
      updatedBy: user.id,
    });
    children.push({
      question: data.question,
      alternatives: data.alternativeQuestions,
      sources: data.officialSources,
      related: data.relatedQuestions,
      media: data.media,
      attachments: data.attachments,
    });
  }

  // ---- Insert orangtua (bulk) dengan onConflictDoNothing ----
  const inserted = parents.length
    ? await db
        .insert(knowledgeItems)
        .values(parents)
        .onConflictDoNothing()
        .returning({ id: knowledgeItems.id, question: knowledgeItems.question })
    : [];
  const idByQuestion = new Map(inserted.map((r) => [r.question, r.id]));

  // ---- Insert anak (alternatives/sources/related/media/attachments) ----
  for (let i = 0; i < parents.length; i++) {
    const parent = parents[i];
    const kid = children[i];
    const parentId = idByQuestion.get(parent.question as string);
    if (!parentId) {
      failedCount++;
      continue;
    }
    importedCount++;

    if (kid.alternatives.length > 0) {
      await db.insert(knowledgeAlternativeQuestions).values(
        kid.alternatives.map((q) => ({ knowledgeId: parentId, question: q })),
      );
    }
    if (kid.sources.length > 0) {
      await db.insert(knowledgeItemSources).values(
        kid.sources.map((s, idx) => ({
          knowledgeId: parentId,
          title: s.title || "Sumber",
          type: "WEBSITE" as const,
          url: s.url || null,
          sortOrder: idx,
        })),
      );
    }
    if (kid.related.length > 0) {
      await db.insert(knowledgeRelatedQuestions).values(
        kid.related.map((q, idx) => ({
          knowledgeId: parentId,
          relatedKnowledgeId: null,
          question: q,
          sortOrder: idx,
        })),
      );
    }
    if (kid.media.length > 0) {
      await db.insert(knowledgeMedia).values(
        kid.media.map((m, idx) => ({
          knowledgeId: parentId,
          type: "IMAGE" as const,
          caption: m.caption || null,
          url: m.url || null,
          filePath: null,
          sortOrder: idx,
        })),
      );
    }
    if (kid.attachments.length > 0) {
      await db.insert(knowledgeAttachments).values(
        kid.attachments.map((a, idx) => ({
          knowledgeId: parentId,
          title: a.title || "Lampiran",
          type: mapAttachmentType(a.type) as
            | "PDF"
            | "DOC"
            | "DOCX"
            | "XLS"
            | "XLSX"
            | "OTHER",
          filePath: null,
          url: a.url || null,
          fileName: a.title || "lampiran",
          fileSize: 0,
          mimeType: a.type || null,
          sortOrder: idx,
        })),
      );
    }
  }

  await db
    .update(faqImportBatches)
    .set({
      status: "COMPLETED",
      importedCount,
      skippedCount,
      failedCount,
      updatedAt: new Date(),
    })
    .where(eq(faqImportBatches.id, batchId));

  await logAudit({
    user,
    action: "IMPORT",
    entity: "IMPORT_BATCH",
    entityId: batchId,
    newData: { importedCount, skippedCount, failedCount, mergedCount, replacedCount },
  });

  revalidatePath("/knowledge/faq");
  revalidatePath("/knowledge/faq/import-history");
  revalidatePath(`/knowledge/faq/import/${batchId}`);

  await runEmbeddingQueueAfterSave();

  return ok(
    `Import selesai: ${importedCount} FAQ masuk, ${skippedCount} dilewati, ${failedCount} gagal.`,
  );
}

// ---------------------------------------------------------------------------
// Rollback import
// ---------------------------------------------------------------------------

export async function rollbackImport(batchId: string): Promise<ActionResult> {
  const user = await requireRole("ADMIN", "SUPER_ADMIN");

  const batch = await db.query.faqImportBatches.findFirst({
    where: eq(faqImportBatches.id, batchId),
  });
  if (!batch) return fail("Batch import tidak ditemukan.");
  if (batch.status === "ROLLED_BACK") return fail("Batch sudah di-rollback.");

  // Rollback hanya FAQ DRAFT/NEEDS_REVIEW yang belum dipublikasikan/diubah.
  const removable = await db.query.knowledgeItems.findMany({
    where: and(
      eq(knowledgeItems.importBatchId, batchId),
      isNull(knowledgeItems.deletedAt),
      inArray(knowledgeItems.status, ["DRAFT", "NEEDS_REVIEW"]),
    ),
    columns: { id: true },
  });
  const kept = await db.$count(
    knowledgeItems,
    and(
      eq(knowledgeItems.importBatchId, batchId),
      isNull(knowledgeItems.deletedAt),
      inArray(knowledgeItems.status, ["ACTIVE", "INACTIVE"]),
    ),
  );

  if (removable.length > 0) {
    await db
      .update(knowledgeItems)
      .set({ deletedAt: new Date(), updatedAt: new Date(), updatedBy: user.id })
      .where(
        inArray(
          knowledgeItems.id,
          removable.map((r) => r.id),
        ),
      );
  }

  await db
    .update(faqImportBatches)
    .set({ status: "ROLLED_BACK", updatedAt: new Date() })
    .where(eq(faqImportBatches.id, batchId));

  await logAudit({
    user,
    action: "ROLLBACK",
    entity: "IMPORT_BATCH",
    entityId: batchId,
    oldData: { batchCode: batch.batchCode },
    newData: { removedCount: removable.length, keptCount: kept },
  });

  revalidatePath("/knowledge/faq");
  revalidatePath("/knowledge/faq/import-history");
  revalidatePath(`/knowledge/faq/import/${batchId}`);

  return ok(
    `Rollback selesai: ${removable.length} FAQ dihapus, ${kept} dipertahankan (sudah dipublikasikan/diarsipkan).`,
  );
}

// ---------------------------------------------------------------------------
// Bulk action FAQ
// ---------------------------------------------------------------------------

const bulkActionSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  action: z.enum([
    "publish",
    "draft",
    "archive",
    "delete",
    "reembed",
    "change_category",
    "change_audience",
  ]),
  categoryId: z.string().uuid().optional().nullable(),
  audience: z.enum(["MAHASISWA", "CALON_MAHASISWA", "ALUMNI", "ORANG_TUA", "UMUM"]).optional().nullable(),
});

export async function bulkFaqAction(input: unknown): Promise<ActionResult> {
  const user = await requireRole("ADMIN", "SUPER_ADMIN");
  const parsed = bulkActionSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const { ids, action, categoryId, audience } = parsed.data;

  const where = and(
    inArray(knowledgeItems.id, ids),
    isNull(knowledgeItems.deletedAt),
  );

  switch (action) {
    case "publish":
      await db
        .update(knowledgeItems)
        .set({ status: "ACTIVE", updatedAt: new Date(), updatedBy: user.id })
        .where(where);
      break;
    case "draft":
      await db
        .update(knowledgeItems)
        .set({ status: "DRAFT", updatedAt: new Date(), updatedBy: user.id })
        .where(where);
      break;
    case "archive":
      await db
        .update(knowledgeItems)
        .set({ status: "INACTIVE", updatedAt: new Date(), updatedBy: user.id })
        .where(where);
      break;
    case "delete":
      await db
        .update(knowledgeItems)
        .set({ deletedAt: new Date(), updatedAt: new Date(), updatedBy: user.id })
        .where(where);
      break;
    case "reembed":
      await db
        .update(knowledgeItems)
        .set({
          embeddingStatus: "PENDING",
          embedding: null,
          embeddingError: null,
          embeddingTextVersion: EMBEDDING_TEXT_VERSION,
          updatedAt: new Date(),
          updatedBy: user.id,
        })
        .where(where);
      break;
    case "change_category":
      if (!categoryId) return fail("Pilih kategori tujuan.");
      await db
        .update(knowledgeItems)
        .set({ categoryId, updatedAt: new Date(), updatedBy: user.id })
        .where(where);
      break;
    case "change_audience":
      if (!audience) return fail("Pilih audiens tujuan.");
      await db
        .update(knowledgeItems)
        .set({ audience, updatedAt: new Date(), updatedBy: user.id })
        .where(where);
      break;
  }

  await logAudit({
    user,
    action: "BULK_UPDATE",
    entity: "FAQ",
    newData: { action, count: ids.length, categoryId, audience },
  });

  revalidatePath("/knowledge/faq");
  if (action === "reembed") await runEmbeddingQueueAfterSave();
  return ok(`Aksi massal "${action}" diterapkan pada ${ids.length} FAQ.`);
}

// ---------------------------------------------------------------------------
// Drain embedding queue (batch) — UI "Embedding Knowledge"
// ---------------------------------------------------------------------------

export async function drainEmbeddingQueue(
  batches: number,
): Promise<ActionResult> {
  await requireRole("ADMIN", "SUPER_ADMIN");
  const n = Math.max(1, Math.min(batches ?? 1, 50));
  let processed = 0;
  let failed = 0;
  for (let i = 0; i < n; i++) {
    const res = await processEmbeddingQueue();
    processed += res.faqProcessed + res.chunkProcessed;
    failed += res.faqFailed + res.chunkFailed;
    if (res.faqProcessed === 0 && res.chunkProcessed === 0) break;
  }
  revalidatePath("/knowledge/faq");
  return ok(
    `Antrian embedding: ${processed} diproses${failed ? `, ${failed} gagal` : ""}.`,
  );
}

// ---------------------------------------------------------------------------
// Generate FAQ dari dokumen
// ---------------------------------------------------------------------------

export async function generateFaqFromDocument(
  documentId: string,
): Promise<ActionResult> {
  const user = await requireRole("ADMIN", "SUPER_ADMIN");

  const doc = await db.query.knowledgeDocuments.findFirst({
    where: eq(knowledgeDocuments.id, documentId),
    columns: { id: true, title: true, status: true },
  });
  if (!doc) return fail("Dokumen tidak ditemukan.");
  if (doc.status === "FAILED") {
    return fail("Dokumen gagal diekstrak teksnya — unggah ulang.");
  }

  const chunks = await db.query.knowledgeDocumentChunks.findMany({
    where: eq(knowledgeDocumentChunks.documentId, documentId),
    columns: { id: true, chunkIndex: true, content: true },
    orderBy: (t, { asc }) => asc(t.chunkIndex),
  });
  if (chunks.length === 0) return fail("Dokumen tidak memiliki bagian teks.");

  let generated = 0;
  let errors = 0;
  const seen = new Set<string>();

  for (const chunk of chunks) {
    let candidates;
    try {
      candidates = await generateCandidatesForChunk(
        { index: chunk.chunkIndex, content: chunk.content },
        doc.title,
      );
    } catch (err) {
      console.error(
        `[faq-generate] Gagal generate chunk #${chunk.chunkIndex}:`,
        err,
      );
      errors++;
      continue;
    }

    for (const c of candidates) {
      const key = c.question.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);

      // Insert sebagai DRAFT yang perlu review + provenance dokumen.
      const [row] = await db
        .insert(knowledgeItems)
        .values({
          question: c.question,
          answer: c.answer,
          categoryId: null,
          audience: mapAudience(c.audience) ?? "MAHASISWA",
          keywords: c.keywords,
          status: "NEEDS_REVIEW",
          internalNote: `Dihasilkan otomatis dari dokumen "${doc.title}".`,
          sourceDocumentId: doc.id,
          sourcePage: chunk.chunkIndex + 1,
          sourceChunkId: chunk.id,
          embeddingStatus: "PENDING",
          embedding: null,
          embeddingError: null,
          embeddingModel: null,
          embeddingTextVersion: EMBEDDING_TEXT_VERSION,
          createdBy: user.id,
          updatedBy: user.id,
        })
        .onConflictDoNothing()
        .returning({ id: knowledgeItems.id });

      if (!row) continue;
      generated++;

      if (c.alternativeQuestions.length > 0) {
        await db.insert(knowledgeAlternativeQuestions).values(
          c.alternativeQuestions.map((q) => ({
            knowledgeId: row.id,
            question: q,
          })),
        );
      }
    }
  }

  await logAudit({
    user,
    action: "GENERATE",
    entity: "DOCUMENT",
    entityId: documentId,
    newData: { documentTitle: doc.title, generated, errors },
  });

  revalidatePath("/knowledge/faq");
  revalidatePath(`/knowledge/documents/${documentId}/faq`);

  // Embedding dijalankan saat admin mem-Publish (bukan saat generate), namun
  // FAQ NEEDS_REVIEW tidak akan di-retrieve sebelum ACTIVE — aman.
  return ok(
    generated > 0
      ? `${generated} kandidat FAQ berhasil dibuat (status Perlu Review).`
      : "Tidak ada FAQ yang bisa dibuat dari dokumen ini (informasi tidak cukup).",
  );
}

// ---------------------------------------------------------------------------
// Pemetaan nilai
// ---------------------------------------------------------------------------

/**
 * Status final FAQ import: kolom `validation_status` (bila = NEEDS_REVIEW)
 * menang atas `status`; default DRAFT.
 */
function finalStatus(data: ParsedFaqRow): KnowledgeStatus {
  const validation = data.validationStatus ? mapStatus(data.validationStatus) : null;
  if (validation === "NEEDS_REVIEW") return "NEEDS_REVIEW";
  return mapStatus(data.status) ?? "DRAFT";
}
