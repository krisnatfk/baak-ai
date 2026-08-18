import { EMBEDDING_TEXT_VERSION } from "@/db/schema";

/**
 * Susun teks yang akan di-embed untuk sebuah FAQ.
 *
 * Format dibakukan (versi `EMBEDDING_TEXT_VERSION`) supaya bisa diregenerasi
 * konsisten. Menggabungkan pertanyaan, variasi pertanyaan, kategori, kata
 * kunci, dan jawaban — field yang relevan untuk retrieval semantik.
 *
 * Dilarang memasukkan `internalNote` (hanya untuk tim) ke dalam teks embedding.
 */

export interface EmbeddingTextSource {
  question: string;
  answer: string;
  keywords: string[];
  audience: string;
  alternatives: string[];
  categoryName?: string | null;
}

export function buildEmbeddingText(source: EmbeddingTextSource): string {
  const parts: string[] = [];

  parts.push("Pertanyaan:", source.question);

  const alts = (source.alternatives ?? []).filter((a) => a.trim().length > 0);
  if (alts.length > 0) {
    parts.push("", "Variasi pertanyaan:");
    for (const alt of alts) {
      parts.push(`- ${alt}`);
    }
  }

  const category = source.categoryName?.trim();
  if (category) {
    parts.push("", `Kategori: ${category}`);
  }

  const keywords = (source.keywords ?? []).filter((k) => k.trim().length > 0);
  if (keywords.length > 0) {
    parts.push("", `Keywords: ${keywords.join(", ")}`);
  }

  const audience = source.audience?.trim();
  if (audience) {
    parts.push("", `Audiens: ${audience}`);
  }

  parts.push("", "Jawaban:", source.answer);

  return parts.join("\n");
}

export function embeddingTextVersion(): string {
  return EMBEDDING_TEXT_VERSION;
}
