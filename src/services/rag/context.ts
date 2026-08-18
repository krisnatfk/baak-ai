import { getRagConfig } from "@/lib/env";
import type { SearchResult } from "./search";

/**
 * Bangun prompt konteks untuk LLM (n8n / bot WhatsApp).
 *
 * Anti-halusinasi: model menjawab HANYA dari blok knowledge base, dalam bahasa
 * Indonesia, dan mengakui ketidaktahuan bila jawaban tidak ada di konteks.
 * Prompt TIDAK memuat ID, skor kemiripan, atau detail internal apa pun.
 */
export function buildRagContext(results: SearchResult[]): string {
  const blocks = results
    .map((r, i) => {
      const lines = [
        `Sumber ${i + 1}:`,
        r.type === "CHUNK"
          ? `[Dokumen] ${r.source ?? "Tanpa sumber"}`
          : `[FAQ] ${r.question}`,
        r.answer,
      ];
      return lines.join("\n");
    })
    .join("\n\n");

  const parts: string[] = [];

  parts.push(
    "Kamu adalah asisten akademik universitas (BAAK AI). Jawablah pertanyaan " +
      "pengguna dengan bahasa Indonesia yang ramah dan singkat.",
  );

  parts.push("=== KNOWLEDGE BASE ===");

  if (results.length === 0) {
    parts.push(
      "(Tidak ada data relevan pada knowledge base — jangan berasumsi. " +
        "Bila tidak ada jawaban di konteks, katakan jujur bahwa Anda belum " +
        "tahu, tanpa memaksakan arah ke BAAK.)",
    );
  } else {
    parts.push(blocks);
  }

  parts.push("=== AKHIR KNOWLEDGE BASE ===");

  parts.push(
    "Aturan: gunakan HANYA informasi dari blok KNOWLEDGE BASE di atas. " +
      "Jangan menambah fakta yang tidak ada di konteks. Bila konteks tidak " +
      "memuat jawaban, katakan jujur bahwa Anda belum tahu dan, bila perlu, " +
      "sarankan menghubungi BAAK / admin.",
  );

  return parts.join("\n\n");
}

export function confidenceThresholds(): { high: number; medium: number } {
  const { thresholdHigh, thresholdMedium } = getRagConfig();
  return {
    high: thresholdHigh,
    medium: thresholdMedium,
  };
}
