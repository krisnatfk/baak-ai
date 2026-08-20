import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { EMBEDDING_TEXT_VERSION } from "@/db/schema";
import {
  knowledgeDocumentChunks,
  knowledgeDocuments,
  knowledgeItems,
  knowledgeCategories,
  knowledgeSources,
  type Audience,
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
 * Deteksi kueri tidak bermakna, sapaan pendek, atau tombol acak (random noise).
 * Mencegah pemborosan embedding dan mencegah retrieval sembarang FAQ.
 */
export function isNoiseQuery(text: string): boolean {
  const s = text.trim().toLowerCase();
  if (s.length < 2) return true;
  // Hanya simbol / tanda baca / angka tanpa huruf (panjang <= 4)
  if (!/[a-z\u00C0-\u024F]/i.test(s) && s.length <= 4) return true;
  // Pengulangan satu karakter identik, mis. "aaa", "ppp", "???"
  if (/^(.)\1+$/.test(s)) return true;
  // Keyboard smash umum
  const noisePatterns = [
    /^asdf/i,
    /^qwerty/i,
    /^zxcv/i,
    /^hjkl/i,
    /^1234/i,
    /^test$/i,
  ];
  if (noisePatterns.some((re) => re.test(s))) return true;
  return false;
}

/**
 * Deteksi kueri layanan mahasiswa aktif yang BUKAN domain PMB (PKL, KRS, KHS, Wisuda, Cuti).
 * Bila pengguna menanyakan hal ini tanpa konteks PMB, tolak agar chatbot tidak memaksakan jawaban FAQ lain.
 */
export function isNonPmbQuery(normalized: string): boolean {
  const s = normalized.trim().toLowerCase();
  const words = s.split(/[\s,.'"\-?!=+*/()]+/);
  const legacyExclusiveTerms = ["pkl", "krs", "khs", "wisuda", "yudisium", "cuti"];
  const hasLegacyTerm = words.some((w) => legacyExclusiveTerms.includes(w));
  if (!hasLegacyTerm) return false;

  const hasPmbContext = /\bpmb\b|\bspmb\b|calon mahasiswa|mahasiswa baru|penerimaan mahasiswa baru/i.test(s);
  return !hasPmbContext;
}

/**
 * Pencarian semantik gabungan: FAQ PMB (ACTIVE, belum dihapus, embedding selesai)
 * + chunk dokumen. Kueri di-normalisasi lalu di-embed; hasil diurutkan dengan
 * operator pgvector cosine (`<=>`), score = 1 − jarak cosine.
 *
 * Menerapkan Relevance Gate:
 *  - Memfilter hanya audiens PMB (CALON_MAHASISWA, UMUM, ORANG_TUA).
 *  - Menyaring noise query (p, asdf, dll) dan domain non-PMB (PKL, KRS, dll).
 *  - Menyaring hasil di bawah threshold relevansi medium.
 */
export async function semanticSearch(
  query: string,
  limit?: number,
  audiences?: string[],
  minimumScore?: number,
): Promise<SearchResponse> {
  const config = getRagConfig();
  const maxResults = Math.max(1, Math.min(limit ?? config.maxResults, 20));
  const normalized = normalizeText(query);

  if (normalized.length === 0 || isNoiseQuery(normalized) || isNonPmbQuery(normalized)) {
    return { results: [], embedTimeMs: 0, searchTimeMs: 0, topScores: [] };
  }

  const targetAudiences = (audiences && audiences.length > 0)
    ? audiences
    : config.defaultAudiences;

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
          inArray(knowledgeItems.audience, targetAudiences as Audience[]),
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

  const rawResults: SearchResult[] = [
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

  rawResults.sort((a, b) => b.score - a.score);

  // Relevance Gate: hanya hasil yang memenuhi ambang batas minimum relevansi (thresholdMedium)
  // yang diteruskan sebagai jawaban valid.
  const relevantResults = rawResults.filter(
    (r) => r.score >= (minimumScore ?? config.thresholdMedium),
  );
  const top = relevantResults.slice(0, maxResults);

  return {
    results: top,
    embedTimeMs,
    searchTimeMs,
    topScores: top.map((r) => r.score),
  };
}
