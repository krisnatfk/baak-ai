import { RAG_CONFIDENCE_VALUES, type RagConfidence } from "@/db/schema";
import { getRagConfig } from "@/lib/env";

/**
 * Klasifikasi confidence berdasarkan ladder threshold dari env.
 *
 *  - HIGH   : score #1 >= thresholdHigh DAN selisih (#1 - #2) >= highMargin
 *             (atau hanya ada satu hasil). Bot boleh menjawab penuh.
 *  - MEDIUM : score #1 >= thresholdMedium. Bot menjawab hati-hati + disclaimer.
 *  - LOW    : di bawah thresholdMedium → ditemukan = false, butuh manusia.
 *
 * Threshold tersimpan sebagai numeric(6,4) di DB dan dibaca ulang oleh
 * konsumen eksternal (n8n) lewat /api/rag/context supaya ladder transparan.
 */
export function classifyConfidence(
  topScore: number,
  topCount: number,
  secondScore: number | null,
): RagConfidence {
  const { thresholdHigh, thresholdMedium, highMargin } = getRagConfig();

  if (topScore >= thresholdHigh) {
    const onlyOne = topCount <= 1;
    const marginOk = secondScore === null || topScore - secondScore >= highMargin;
    if (onlyOne || marginOk) return "HIGH";
    return "MEDIUM";
  }
  if (topScore >= thresholdMedium) return "MEDIUM";
  return "LOW";
}

export { RAG_CONFIDENCE_VALUES };
