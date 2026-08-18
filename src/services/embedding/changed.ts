/**
 * Deteksi perubahan konten FAQ yang memengaruhi embedding.
 *
 * Predikat yang SAMA dipakai oleh server action `updateFaq`
 * (src/lib/server/actions/knowledge.ts) dan skrip integrasi
 * (scripts/test-api.mts, Test E/F). Satu sumber kebenaran untuk menentukan
 * kapan vektor lama dianggap usang:
 *
 *   - HANYA perubahan pada EMBEDDING_FIELDS yang memicu re-embedding.
 *   - Perubahan `sourceUrl`, kategori, status, media, lampiran TIDAK membuat
 *     embedding usang (teks yang di-embed tidak memuat kolom tersebut).
 *   - FAQ dengan embedding FAILED selalu dianggap berubah (layak retry).
 */

export interface EmbeddingRelevantFields {
  question: string;
  answer: string;
  keywords: string[];
  audience: string;
}

/** Kolom FAQ yang memengaruhi embedding (jika berubah → embedding usang). */
export const EMBEDDING_FIELDS: (keyof EmbeddingRelevantFields)[] = [
  "question",
  "answer",
  "keywords",
  "audience",
];

export function embeddingFieldsChanged(
  existing: EmbeddingRelevantFields,
  next: EmbeddingRelevantFields,
): boolean {
  return EMBEDDING_FIELDS.some((field) => {
    const a = existing[field];
    const b = next[field];
    if (Array.isArray(a) && Array.isArray(b)) {
      return a.length !== b.length || a.some((v, i) => v !== b[i]);
    }
    return a !== b;
  });
}
