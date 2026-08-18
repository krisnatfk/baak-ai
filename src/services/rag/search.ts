import { and, eq, isNull, sql } from "drizzle-orm";
import { EMBEDDING_TEXT_VERSION } from "@/db/schema";
import {
  knowledgeDocumentChunks,
  knowledgeDocuments,
  knowledgeItems,
  knowledgeCategories,
  knowledgeSources,
} from "@/db/schema";
import { db } from "@/db/client";
import { getRagConfig } from "@/lib/env";
import { getEmbeddingProvider } from "@/services/embedding";
import { normalizeText } from "./normalize";

export interface SearchResult {
  id: string;
  type: "FAQ" | "CHUNK";
  /** Pertanyaan FAQ (untuk tipe FAQ). */
  question?: string;
  /** Jawaban FAQ / konten chunk. */
  answer: string;
  /** Nama kategori (FAQ). */
  category?: string | null;
  /** Judul sumber asal (FAQ: sumber FAQ; CHUNK: judul dokumen). */
  source?: string | null;
  /** URL rujukan (jika ada). */
  url?: string | null;
  /** Cosine similarity 0..1 (1 = identik). */
  score: number;
}

export interface SearchResponse {
  results: SearchResult[];
  embedTimeMs: number;
  searchTimeMs: number;
  topScores: number[];
}

/**
 * Pencarian semantik gabungan: FAQ (ACTIVE, belum dihapus, embedding selesai)
 * + chunk dokumen. Kueri di-normalisasi lalu di-embed; hasil diurutkan dengan
 * operator pgvector cosine (`<=>`), score = 1 − jarak cosine.
 *
 * Predikat WHERE mengikuti partial HNSW index di schema (status/deleted/status
 * embedding) plus re-check `embedding_text_version` dan `embedding IS NOT NULL`
 * yang TIDAK termasuk index.
 */
export async function semanticSearch(
  query: string,
  limit?: number,
): Promise<SearchResponse> {
  const maxResults = Math.max(1, Math.min(limit ?? getRagConfig().maxResults, 20));
  const normalized = normalizeText(query);

  if (normalized.length === 0) {
    return { results: [], embedTimeMs: 0, searchTimeMs: 0, topScores: [] };
  }

  const provider = getEmbeddingProvider();

  const tEmbed = performance.now();
  const vector = await provider.embed(normalized);
  const embedTimeMs = Math.round(performance.now() - tEmbed);

  // Literal vektor untuk operator <=> (diparse oleh pgvector).
  const vecLiteral = JSON.stringify(vector);

  const tSearch = performance.now();

  const [faqRows, chunkRows] = await Promise.all([
    db
      .select({
        id: knowledgeItems.id,
        question: knowledgeItems.question,
        answer: knowledgeItems.answer,
        sourceUrl: knowledgeItems.sourceUrl,
        categoryName: knowledgeCategories.name,
        sourceTitle: knowledgeSources.title,
        distance: sql<number>`${knowledgeItems.embedding} <=> ${vecLiteral}::vector`,
      })
      .from(knowledgeItems)
      .leftJoin(knowledgeCategories, eq(knowledgeCategories.id, knowledgeItems.categoryId))
      .leftJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeItems.sourceId))
      .where(
        and(
          eq(knowledgeItems.status, "ACTIVE"),
          isNull(knowledgeItems.deletedAt),
          eq(knowledgeItems.embeddingStatus, "COMPLETED"),
          eq(knowledgeItems.embeddingTextVersion, EMBEDDING_TEXT_VERSION),
          sql`${knowledgeItems.embedding} IS NOT NULL`,
        ),
      )
      .orderBy(sql`${knowledgeItems.embedding} <=> ${vecLiteral}::vector`)
      .limit(maxResults),

    db
      .select({
        id: knowledgeDocumentChunks.id,
        documentId: knowledgeDocumentChunks.documentId,
        content: knowledgeDocumentChunks.content,
        docTitle: knowledgeDocuments.title,
        sourceTitle: knowledgeSources.title,
        sourceUrl: knowledgeSources.url,
        distance: sql<number>`${knowledgeDocumentChunks.embedding} <=> ${vecLiteral}::vector`,
      })
      .from(knowledgeDocumentChunks)
      .leftJoin(
        knowledgeDocuments,
        eq(knowledgeDocuments.id, knowledgeDocumentChunks.documentId),
      )
      .leftJoin(
        knowledgeSources,
        eq(knowledgeSources.id, knowledgeDocuments.sourceId),
      )
      .where(
        and(
          eq(knowledgeDocumentChunks.embeddingStatus, "COMPLETED"),
          eq(knowledgeDocumentChunks.embeddingTextVersion, EMBEDDING_TEXT_VERSION),
          sql`${knowledgeDocumentChunks.embedding} IS NOT NULL`,
        ),
      )
      .orderBy(sql`${knowledgeDocumentChunks.embedding} <=> ${vecLiteral}::vector`)
      .limit(maxResults),
  ]);

  const searchTimeMs = Math.round(performance.now() - tSearch);

  const results: SearchResult[] = [
    ...faqRows.map((r) => ({
      id: r.id,
      type: "FAQ" as const,
      question: r.question,
      answer: r.answer,
      category: r.categoryName ?? null,
      source: r.sourceTitle ?? null,
      url: r.sourceUrl ?? null,
      score: 1 - r.distance,
    })),
    ...chunkRows.map((r) => ({
      id: r.id,
      type: "CHUNK" as const,
      answer: r.content,
      source: r.docTitle ?? r.sourceTitle ?? null,
      url: r.sourceUrl ?? null,
      score: 1 - r.distance,
    })),
  ];

  results.sort((a, b) => b.score - a.score);
  const top = results.slice(0, maxResults);

  return {
    results: top,
    embedTimeMs,
    searchTimeMs,
    topScores: top.map((r) => r.score),
  };
}
