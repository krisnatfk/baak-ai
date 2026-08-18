import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, clientIp } from "@/lib/server/api-errors";
import { verifyInternalApiKey } from "@/lib/server/internal-auth";
import { rateLimit } from "@/lib/server/rate-limit";
import { getRagConfig } from "@/lib/env";
import { logRetrieval } from "@/lib/server/retrieval";
import { recordChatMessage } from "@/lib/server/chat";
import { saveUnanswered } from "@/lib/server/unanswered";
import { semanticSearch } from "@/services/rag/search";
import { classifyConfidence } from "@/services/rag/confidence";
import { buildRagContext, confidenceThresholds } from "@/services/rag/context";
import { buildRagAnswer } from "@/services/rag/answer";
import { normalizeText } from "@/services/rag/normalize";

export const dynamic = "force-dynamic";

const contextSchema = z.object({
  message: z.string().trim().min(1, "message wajib diisi").max(2000),
  sessionId: z.string().trim().max(191).nullish(),
  sender: z.string().trim().max(50).nullish(),
});

/**
 * POST /api/rag/context — endpoint utama n8n.
 *
 * Internal API: wajib `Authorization: Bearer ${INTERNAL_API_KEY}`.
 * Mengembalikan konteks siap-pakai untuk Local LLM + logika anti-halusinasi:
 *  - HIGH/MEDIUM → `found: true` + context prompt + sources + suggestions +
 *    media + attachments (semua dari KB, bukan LLM).
 *  - LOW         → `found: false, context: null, requiresHuman: true`
 *    (n8n arahkan ke alur human/unknown); pertanyaan disimpan ke unanswered.
 *
 * Efek samping: chat memory (bila sessionId ada), retrieval_logs, unanswered.
 */
export async function POST(request: Request) {
  if (!verifyInternalApiKey(request)) {
    return apiError(401, "UNAUTHORIZED", "API key tidak valid.");
  }

  const ip = clientIp(request);
  const rl = rateLimit(`rag:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "RATE_LIMITED", message: "Terlalu banyak permintaan, coba lagi nanti." },
      { status: 429 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return apiError(400, "VALIDATION_ERROR", "Body harus JSON.");
  }
  const parsed = contextSchema.safeParse(json);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Parameter tidak valid.");
  }
  const { message, sessionId, sender } = parsed.data;

  // ---- Retrieval + klasifikasi confidence ----
  const { results, embedTimeMs, searchTimeMs } = await semanticSearch(message);
  const topScore = results[0]?.score ?? 0;
  const secondScore = results[1]?.score ?? null;
  const confidence = classifyConfidence(topScore, results.length, secondScore);
  const found = confidence !== "LOW";

  // Pelengkap jawaban (sumber/saran/media/lampiran) hanya saat ditemukan;
  // saat tidak ditemukan semua dikosongkan.
  const enrichment = found ? await buildRagAnswer(results) : null;
  const context = found ? buildRagContext(results) : null;

  // ---- Efek samping (best-effort, tidak menggagalkan respons) ----

  // 1) Chat memory — simpan pesan USER bila ada sessionId.
  if (sessionId) {
    try {
      await recordChatMessage({
        sessionId,
        sender,
        channel: "WHATSAPP",
        role: "USER",
        content: message,
        // Isi topic hanya saat masih kosong (pertanyaan pertama).
        topic: message,
      });
    } catch (err) {
      console.error("[rag/context] Gagal menyimpan chat:", err);
    }
  }

  // 2) Pertanyaan tidak terjawab (LOW) → antre untuk review admin.
  if (!found) {
    try {
      await saveUnanswered({
        question: message,
        normalizedQuestion: normalizeText(message),
        sender,
        sessionId,
        bestSimilarityScore: topScore,
      });
    } catch (err) {
      console.error("[rag/context] Gagal menyimpan unanswered:", err);
    }
  }

  // 3) Retrieval log untuk analitik.
  try {
    const ragConfig = getRagConfig();
    await logRetrieval({
      query: message,
      sessionId,
      sender,
      embedTimeMs,
      searchTimeMs,
      topScore,
      confidence,
      bestKnowledgeId: results[0]?.id ?? null,
      bestSourceType: results[0]?.type ?? null,
      topScores: results.map((r) => ({
        id: r.id,
        type: r.type,
        score: Number(r.score.toFixed(4)),
      })),
      thresholdHigh: ragConfig.thresholdHigh,
      thresholdMedium: ragConfig.thresholdMedium,
      resultCount: results.length,
    });
  } catch (err) {
    console.error("[rag/context] Gagal menyimpan retrieval_logs:", err);
  }

  const thresholds = confidenceThresholds();

  if (found && enrichment) {
    return NextResponse.json({
      success: true,
      found: true,
      confidence,
      score: Number(topScore.toFixed(4)),
      context,
      sources: enrichment.sources,
      suggestions: enrichment.suggestions,
      media: enrichment.media,
      attachments: enrichment.attachments,
      requiresHuman: false,
      thresholds,
    });
  }

  return NextResponse.json({
    success: true,
    found: false,
    confidence: "LOW",
    score: Number(topScore.toFixed(4)),
    context: null,
    sources: [],
    suggestions: [],
    media: [],
    attachments: [],
    requiresHuman: true,
    message: "Pertanyaan disimpan sebagai pertanyaan tidak terjawab.",
    thresholds,
  });
}
