/**
 * Server Actions — manajemen dokumen knowledge base (ADMIN / SUPER_ADMIN).
 *
 * Alur upload:
 *  1. Validasi form (zod) + role.
 *  2. Simpan file ke disk (UPLOAD_DIR) dengan nama yang ditulis ulang.
 *  3. Insert baris knowledge_documents (status PROCESSING).
 *  4. Ekstrak teks (PDF/DOCX/TXT) → chunking → bulk insert
 *     knowledge_document_chunks (status PENDING, siap di-embed worker).
 *  5. Update dokumen: COMPLETED + chunkCount; gagal → FAILED + error.
 *  6. Audit log (UPLOAD / CHUNK / PROCESS / RETRY_EMBEDDING / DELETE).
 *  7. Jalankan antrian embedding (fire-and-forget) lalu revalidate.
 */

"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  knowledgeDocumentChunks,
  knowledgeDocuments,
  knowledgeSources,
} from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { requireRole } from "@/lib/guards";
import { uploadDocumentSchema } from "@/lib/documents-schema";
import { saveUpload, UploadError } from "@/lib/server/upload";
import { removeLocalUploadFile } from "@/lib/server/upload-storage";
import { extractTextFromBuffer } from "@/services/document/extract";
import { chunkText, type Chunk } from "@/services/document/chunk";
import { processEmbeddingQueue } from "@/services/embedding/worker";
import { type ActionResult, fail, ok, zodFail } from "./shared";

export type { ActionResult } from "./shared";

const MAX_ERROR_LENGTH = 1000;

function truncateError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > MAX_ERROR_LENGTH
    ? `${message.slice(0, MAX_ERROR_LENGTH)}…`
    : message;
}

/** Jalankan antrian embedding tanpa menunggu (fire-and-forget). */
async function runEmbeddingQueueAfterSave(): Promise<void> {
  try {
    await processEmbeddingQueue();
  } catch (error) {
    console.error("[documents] Gagal menjalankan antrian embedding:", error);
  }
}

// ---------------------------------------------------------------------------
// Upload dokumen
// ---------------------------------------------------------------------------

export async function uploadDocument(
  sourceId: string,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireRole("ADMIN", "SUPER_ADMIN");

  const parsed = uploadDocumentSchema.safeParse({
    sourceId,
    file: formData.get("file"),
  });
  if (!parsed.success) return zodFail(parsed.error);
  const file = parsed.data.file;
  if (!(file instanceof File)) return fail("File tidak valid.");

  // Sumber opsional — pastikan valid bila diisi.
  let source: { id: string; title: string } | null = null;
  if (parsed.data.sourceId) {
    const found = await db.query.knowledgeSources.findFirst({
      where: eq(knowledgeSources.id, parsed.data.sourceId),
      columns: { id: true, title: true },
    });
    source = found ?? null;
    if (!source) return fail("Sumber dokumen tidak ditemukan.");
  }

  // 1. Simpan file ke disk.
  let saved: Awaited<ReturnType<typeof saveUpload>>;
  try {
    saved = await saveUpload(file);
  } catch (error) {
    if (error instanceof UploadError) return fail(error.message);
    throw error;
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // 2. Insert dokumen (status PROCESSING) sebelum ekstraksi.
  const titleBase = saved.fileName.slice(0, saved.fileName.lastIndexOf("."));
  const [doc] = await db
    .insert(knowledgeDocuments)
    .values({
      title: titleBase || saved.fileName,
      sourceId: source?.id ?? null,
      fileName: saved.fileName,
      fileType: saved.fileType,
      fileSize: saved.fileSize,
      filePath: saved.filePath,
      status: "PROCESSING",
      createdBy: actor.id,
    })
    .returning({ id: knowledgeDocuments.id });

  // 3. Ekstraksi + chunking. Gagal → tandai FAILED.
  let chunks: Chunk[] = [];
  try {
    const text = await extractTextFromBuffer(buffer, saved.fileType);
    chunks = chunkText(text);
    if (chunks.length === 0) {
      throw new Error("Tidak ada teks yang bisa diekstrak dari dokumen.");
    }

    await db.transaction(async (tx) => {
      await tx.insert(knowledgeDocumentChunks).values(
        chunks.map((chunk, index) => ({
          documentId: doc.id,
          chunkIndex: index,
          content: chunk.content,
          tokenEstimate: chunk.tokenEstimate,
        })),
      );
      await tx
        .update(knowledgeDocuments)
        .set({ status: "COMPLETED", chunkCount: chunks.length, error: null })
        .where(eq(knowledgeDocuments.id, doc.id));
    });
  } catch (error) {
    const message = truncateError(error);
    await db
      .update(knowledgeDocuments)
      .set({ status: "FAILED", error: message })
      .where(eq(knowledgeDocuments.id, doc.id));
    await logAudit({
      user: actor,
      action: "PROCESS",
      entity: "DOCUMENT",
      entityId: doc.id,
      oldData: { status: "PROCESSING" },
      newData: { status: "FAILED", error: message },
    });
    revalidatePath("/knowledge/documents");
    return fail(`Gagal memproses dokumen: ${message}`);
  }

  // 4. Audit: UPLOAD, CHUNK, PROCESS.
  await logAudit({
    user: actor,
    action: "UPLOAD",
    entity: "DOCUMENT",
    entityId: doc.id,
    newData: {
      fileName: saved.fileName,
      fileType: saved.fileType,
      fileSize: saved.fileSize,
      source: source?.title ?? null,
    },
  });
  await logAudit({
    user: actor,
    action: "CHUNK",
    entity: "DOCUMENT",
    entityId: doc.id,
    newData: { chunkCount: chunks.length },
  });
  await logAudit({
    user: actor,
    action: "PROCESS",
    entity: "DOCUMENT",
    entityId: doc.id,
    oldData: { status: "PROCESSING" },
    newData: { status: "COMPLETED", chunkCount: chunks.length },
  });

  // 5. Trigger embedding (fire-and-forget).
  await runEmbeddingQueueAfterSave();

  revalidatePath("/knowledge/documents");
  return ok(
    `Dokumen berhasil diproses — ${chunks.length} bagian siap di-embed.`,
    doc.id,
  );
}

// ---------------------------------------------------------------------------
// Retry embedding chunk yang gagal
// ---------------------------------------------------------------------------

export async function retryDocumentEmbedding(
  id: string,
): Promise<ActionResult> {
  const actor = await requireRole("ADMIN", "SUPER_ADMIN");

  const doc = await db.query.knowledgeDocuments.findFirst({
    where: eq(knowledgeDocuments.id, id),
    columns: { id: true, fileName: true, status: true },
  });
  if (!doc) return fail("Dokumen tidak ditemukan.");
  if (doc.status === "FAILED") {
    return fail(
      "Dokumen gagal diekstrak teksnya. Hapus lalu unggah ulang dokumen.",
    );
  }

  // Reset chunk dengan status FAILED agar diproses ulang oleh worker.
  await db
    .update(knowledgeDocumentChunks)
    .set({
      embeddingStatus: "PENDING",
      embedding: null,
      embeddingError: null,
      embeddingTextVersion: null,
    })
    .where(
      and(
        eq(knowledgeDocumentChunks.documentId, id),
        eq(knowledgeDocumentChunks.embeddingStatus, "FAILED"),
      ),
    );

  await logAudit({
    user: actor,
    action: "RETRY_EMBEDDING",
    entity: "DOCUMENT",
    entityId: id,
    newData: { fileName: doc.fileName, status: doc.status },
  });

  await runEmbeddingQueueAfterSave();
  revalidatePath("/knowledge/documents");
  return ok("Chunk yang gagal akan di-embed ulang.");
}

// ---------------------------------------------------------------------------
// Hapus dokumen
// ---------------------------------------------------------------------------

export async function deleteDocument(id: string): Promise<ActionResult> {
  const actor = await requireRole("ADMIN", "SUPER_ADMIN");

  const doc = await db.query.knowledgeDocuments.findFirst({
    where: eq(knowledgeDocuments.id, id),
    columns: { id: true, fileName: true, filePath: true },
  });
  if (!doc) return fail("Dokumen tidak ditemukan.");

  // Chunks terhapus otomatis (onDelete cascade).
  await db.delete(knowledgeDocuments).where(eq(knowledgeDocuments.id, id));

  // Hapus file dari disk (best-effort), hanya jika masih di dalam UPLOAD_DIR.
  await removeStoredFile(doc.filePath);

  await logAudit({
    user: actor,
    action: "DELETE",
    entity: "DOCUMENT",
    entityId: id,
    oldData: { fileName: doc.fileName, filePath: doc.filePath },
  });
  revalidatePath("/knowledge/documents");
  return ok("Dokumen dihapus.");
}

/** Hapus file dari disk — hanya path di dalam UPLOAD_DIR (cegah traversal). */
async function removeStoredFile(relativePath: string): Promise<void> {
  try {
    await removeLocalUploadFile(relativePath);
  } catch {
    // File mungkin sudah tidak ada — abaikan.
  }
}
