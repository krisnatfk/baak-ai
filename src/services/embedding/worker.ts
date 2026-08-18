import { and, eq, isNull } from "drizzle-orm";
import { EMBEDDING_TEXT_VERSION } from "@/db/schema";
import {
  knowledgeDocumentChunks,
  knowledgeItems,
} from "@/db/schema";
import { db } from "@/db/client";
import { getEmbeddingConfig } from "@/lib/env";
import { getEmbeddingProvider } from "@/services/embedding";
import { buildEmbeddingText } from "@/services/rag/embedding-text";

export interface EmbeddingQueueResult {
  faqProcessed: number;
  faqFailed: number;
  chunkProcessed: number;
  chunkFailed: number;
}

function truncateError(err: unknown, max = 2000): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.slice(0, max);
}

/**
 * Proses antrian embedding: semua baris dengan `embedding_status = PENDING`
 * (FAQ baru/berubah/gagal-retry + chunk dokumen) di-embed per batch.
 *
 * Sukses → COMPLETED (+ embedding, embedding_model, embedding_text_version).
 * Gagal  → FAILED (+ embedding_error, embedding dikosongkan) agar bisa retry.
 *
 * Dipanggil: (a) setelah server action save FAQ (sinkron, via queue runner),
 * (b) dari `POST /api/embedding/process` (drain dari n8n/loop).
 */
export async function processEmbeddingQueue(
  opts?: { batchSize?: number },
): Promise<EmbeddingQueueResult> {
  const batchSize = opts?.batchSize ?? getEmbeddingConfig().batchSize;
  const provider = getEmbeddingProvider();
  const result: EmbeddingQueueResult = {
    faqProcessed: 0,
    faqFailed: 0,
    chunkProcessed: 0,
    chunkFailed: 0,
  };

  // ---- FAQ ----
  const faqCandidates = await db.query.knowledgeItems.findMany({
    where: and(
      eq(knowledgeItems.embeddingStatus, "PENDING"),
      isNull(knowledgeItems.deletedAt),
    ),
    columns: {
      id: true,
      question: true,
      answer: true,
      keywords: true,
      audience: true,
      categoryId: true,
    },
    with: {
      category: { columns: { name: true } },
      alternatives: { columns: { question: true } },
    },
    limit: batchSize,
  });

  if (faqCandidates.length > 0) {
    const texts = faqCandidates.map((f) =>
      buildEmbeddingText({
        question: f.question,
        answer: f.answer,
        keywords: f.keywords,
        audience: f.audience,
        categoryName: f.category?.name,
        alternatives: f.alternatives.map((a) => a.question),
      }),
    );

    try {
      const vectors = await provider.embedTexts(texts);
      await db.transaction(async (tx) => {
        for (let i = 0; i < faqCandidates.length; i++) {
          await tx
            .update(knowledgeItems)
            .set({
              embedding: vectors[i],
              embeddingStatus: "COMPLETED",
              embeddingError: null,
              embeddingModel: provider.model,
              embeddingTextVersion: EMBEDDING_TEXT_VERSION,
            })
            .where(eq(knowledgeItems.id, faqCandidates[i].id));
        }
      });
      result.faqProcessed = faqCandidates.length;
    } catch (err) {
      const message = truncateError(err);
      await db.transaction(async (tx) => {
        for (const f of faqCandidates) {
          await tx
            .update(knowledgeItems)
            .set({
              embedding: null,
              embeddingStatus: "FAILED",
              embeddingError: message,
            })
            .where(eq(knowledgeItems.id, f.id));
        }
      });
      result.faqFailed = faqCandidates.length;
    }
  }

  // ---- Chunk dokumen ----
  const chunkCandidates = await db
    .select({ id: knowledgeDocumentChunks.id, content: knowledgeDocumentChunks.content })
    .from(knowledgeDocumentChunks)
    .where(eq(knowledgeDocumentChunks.embeddingStatus, "PENDING"))
    .limit(batchSize);

  if (chunkCandidates.length > 0) {
    const texts = chunkCandidates.map((c) => c.content);
    try {
      const vectors = await provider.embedTexts(texts);
      await db.transaction(async (tx) => {
        for (let i = 0; i < chunkCandidates.length; i++) {
          await tx
            .update(knowledgeDocumentChunks)
            .set({
              embedding: vectors[i],
              embeddingStatus: "COMPLETED",
              embeddingError: null,
              embeddingTextVersion: EMBEDDING_TEXT_VERSION,
            })
            .where(eq(knowledgeDocumentChunks.id, chunkCandidates[i].id));
        }
      });
      result.chunkProcessed = chunkCandidates.length;
    } catch (err) {
      const message = truncateError(err);
      await db.transaction(async (tx) => {
        for (const c of chunkCandidates) {
          await tx
            .update(knowledgeDocumentChunks)
            .set({
              embedding: null,
              embeddingStatus: "FAILED",
              embeddingError: message,
            })
            .where(eq(knowledgeDocumentChunks.id, c.id));
        }
      });
      result.chunkFailed = chunkCandidates.length;
    }
  }

  return result;
}
