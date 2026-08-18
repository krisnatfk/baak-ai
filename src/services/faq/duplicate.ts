/**
 * Deteksi duplikat import FAQ — dua tingkat.
 *
 * LEVEL 1 (exact): normalisasi `normalizeText()` lalu bandingkan terhadap FAQ
 *   existing (semua yang belum terhapus) dan antar baris dalam file.
 *
 * LEVEL 2 (semantic): embedding pertanyaan via provider yang sama dengan RAG,
 *   lalu (a) cosine terhadap embedding FAQ existing (ACTIVE+COMPLETED) lewat
 *   pgvector, dan (b) cosine antar baris dalam batch. Kemiripan ≥ threshold
 *   ditandai "possible duplicate" — TIDAK dihapus otomatis (admin yang
 *   memutuskan Skip/Replace/Merge/Import Anyway).
 *
 * Bila EMBEDDING_PROVIDER=hash, level semantik dilewati (hash bukan retrieval
 * semantik yang valid) dan hanya level exact yang berjalan.
 */

import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { knowledgeItems } from "@/db/schema";
import { getEmbeddingConfig } from "@/lib/env";
import { getEmbeddingProvider } from "@/services/embedding";
import { normalizeText } from "@/services/rag/normalize";
import type { ParsedFaqRow } from "./import-parser";

export const SEMANTIC_DUPLICATE_THRESHOLD = 0.92;

export interface DuplicateHit {
  rowNumber: number;
  kind: "EXACT" | "SEMANTIC";
  /** ID FAQ existing yang tertabrak (null bila duplikat antar-baris file). */
  matchedId: string | null;
  matchedQuestion: string;
  score?: number;
}

/** Kemiripan kosinus dua vektor (dimensi sama). */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

interface ExistingFaq {
  id: string;
  question: string;
}

/**
 * Deteksi duplikat untuk seluruh baris. Mengembalikan Map rowNumber → hit
 * (maksimum satu hit per baris; exact diprioritaskan atas semantic).
 */
export async function detectDuplicates(
  rows: ParsedFaqRow[],
): Promise<Map<number, DuplicateHit>> {
  const hits = new Map<number, DuplicateHit>();
  if (rows.length === 0) return hits;

  // ---- LEVEL 1: exact normalized ----
  const existing: ExistingFaq[] = await db
    .select({ id: knowledgeItems.id, question: knowledgeItems.question })
    .from(knowledgeItems)
    .where(isNull(knowledgeItems.deletedAt));

  const existingByNorm = new Map<string, ExistingFaq>();
  for (const e of existing) {
    const norm = normalizeText(e.question);
    if (norm && !existingByNorm.has(norm)) existingByNorm.set(norm, e);
  }

  const batchByNorm = new Map<string, number>(); // norm → rowNumber pertama
  for (const row of rows) {
    const norm = normalizeText(row.question);
    if (!norm) continue;
    const existingHit = existingByNorm.get(norm);
    if (existingHit) {
      hits.set(row.rowNumber, {
        rowNumber: row.rowNumber,
        kind: "EXACT",
        matchedId: existingHit.id,
        matchedQuestion: existingHit.question,
      });
      continue;
    }
    const batchRow = batchByNorm.get(norm);
    if (batchRow !== undefined) {
      const other = rows.find((r) => r.rowNumber === batchRow);
      hits.set(row.rowNumber, {
        rowNumber: row.rowNumber,
        kind: "EXACT",
        matchedId: null,
        matchedQuestion: other?.question ?? "",
      });
      continue;
    }
    batchByNorm.set(norm, row.rowNumber);
  }

  // ---- LEVEL 2: semantic (lewati bila provider hash) ----
  const provider = getEmbeddingConfig().provider;
  if (provider === "hash") return hits;

  const candidates = rows.filter(
    (r) => r.question.trim() && !hits.has(r.rowNumber),
  );
  if (candidates.length === 0) return hits;

  try {
    const vectors = await getEmbeddingProvider().embedTexts(
      candidates.map((r) => r.question),
    );
    await markSemanticHits(candidates, vectors, hits);
  } catch (err) {
    // Gagal embedding untuk dedup bukan kegagalan fatal — log & lanjut.
    console.error("[faq-import] Gagal deteksi duplikat semantik:", err);
  }

  return hits;
}

/** Tandai duplikat semantik: against-existing (pgvector) + within-batch (cosine). */
async function markSemanticHits(
  candidates: ParsedFaqRow[],
  vectors: number[][],
  hits: Map<number, DuplicateHit>,
): Promise<void> {
  const vecLiteral = (v: number[]) => JSON.stringify(v);

  // (a) Against existing via pgvector — concurrency-limited.
  const CONCURRENCY = 6;
  for (let start = 0; start < candidates.length; start += CONCURRENCY) {
    const chunk = candidates.slice(start, start + CONCURRENCY);
    await Promise.all(
      chunk.map(async (row, i) => {
        const vec = vectors[start + i];
        const rows = await db
          .select({
            id: knowledgeItems.id,
            question: knowledgeItems.question,
            distance: sql<number>`${knowledgeItems.embedding} <=> ${vecLiteral(vec)}::vector`,
          })
          .from(knowledgeItems)
          .where(
            and(
              eq(knowledgeItems.status, "ACTIVE"),
              isNull(knowledgeItems.deletedAt),
              eq(knowledgeItems.embeddingStatus, "COMPLETED"),
              sql`${knowledgeItems.embedding} IS NOT NULL`,
            ),
          )
          .orderBy(
            sql`${knowledgeItems.embedding} <=> ${vecLiteral(vec)}::vector`,
          )
          .limit(1);
        const top = rows[0];
        if (top) {
          const score = 1 - top.distance;
          if (score >= SEMANTIC_DUPLICATE_THRESHOLD) {
            hits.set(row.rowNumber, {
              rowNumber: row.rowNumber,
              kind: "SEMANTIC",
              matchedId: top.id,
              matchedQuestion: top.question,
              score,
            });
          }
        }
      }),
    );
  }

  // (b) Within-batch pairwise cosine (hanya antar baris yang belum tertandai).
  const vectorByRow = new Map<number, number[]>();
  candidates.forEach((r, i) => vectorByRow.set(r.rowNumber, vectors[i]));
  const remaining = candidates.filter((r) => !hits.has(r.rowNumber));

  for (let i = 0; i < remaining.length; i++) {
    const va = vectorByRow.get(remaining[i].rowNumber)!;
    for (let j = i + 1; j < remaining.length; j++) {
      const vb = vectorByRow.get(remaining[j].rowNumber)!;
      const score = cosineSimilarity(va, vb);
      if (score >= SEMANTIC_DUPLICATE_THRESHOLD) {
        const a = remaining[i];
        const b = remaining[j];
        // Tandai baris yang muncul belakangan sebagai duplikat.
        const later = a.rowNumber > b.rowNumber ? a : b;
        const earlier = later === a ? b : a;
        if (!hits.has(later.rowNumber)) {
          hits.set(later.rowNumber, {
            rowNumber: later.rowNumber,
            kind: "SEMANTIC",
            matchedId: null,
            matchedQuestion: earlier.question,
            score,
          });
        }
      }
    }
  }
}
