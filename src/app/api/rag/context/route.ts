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
import { buildRagContext } from "@/services/rag/context";
import { buildRagAnswer } from "@/services/rag/answer";
import { normalizeText } from "@/services/rag/normalize";
import { getBotSettings } from "@/lib/server/bot-settings";
import { getBotMenu } from "@/services/bot/menu";
import { logBotEventBestEffort } from "@/services/bot/analytics";
import {
  buildHandoffDetails,
  recordRagHandoffState,
} from "@/services/bot/handoff-state";

export const dynamic = "force-dynamic";

const contextSchema = z.object({
  message: z.string().trim().min(1, "message wajib diisi").max(2000),
  sessionId: z.string().trim().max(191).nullish(),
  session_id: z.string().trim().max(191).nullish(),
  chatId: z.string().trim().max(191).nullish(),
  sender: z.string().trim().max(50).nullish(),
  senderId: z.string().trim().max(50).nullish(),
  from: z.string().trim().max(50).nullish(),
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
  const { message } = parsed.data;
  const sender = parsed.data.sender ?? parsed.data.senderId ?? parsed.data.from ?? null;
  const sessionId =
    parsed.data.sessionId ??
    parsed.data.session_id ??
    parsed.data.chatId ??
    (sender ? `sender:${sender}` : null);

  // ---- Retrieval + klasifikasi confidence ----
  const settings = await getBotSettings();
  const envConfig = getRagConfig();
  const thresholdHigh = settings.similarityEnabled
    ? settings.similarityHigh
    : envConfig.thresholdHigh;
  const thresholdMedium = settings.similarityEnabled
    ? settings.similarityMedium
    : envConfig.thresholdMedium;
  const suggestionEnabled =
    settings.similaritySuggestionEnabled && settings.similarityMaxSuggestions > 0;
  const minimumCandidateScore = suggestionEnabled
    ? Math.max(0.35, thresholdMedium - 0.15)
    : thresholdMedium;
  const { results, embedTimeMs, searchTimeMs } = await semanticSearch(
    message,
    undefined,
    undefined,
    minimumCandidateScore,
  );
  const topScore = results[0]?.score ?? 0;
  const secondScore = results[1]?.score ?? null;
  const confidence = classifyConfidence(topScore, results.length, secondScore, {
    high: thresholdHigh,
    medium: thresholdMedium,
  });
  const found = confidence !== "LOW";

  // Pelengkap jawaban (sumber/saran/media/lampiran) hanya saat ditemukan;
  // saat tidak ditemukan semua dikosongkan.
  const enrichment = await buildRagAnswer(results, {
    thresholdMedium,
    suggestionEnabled,
    maxSuggestions: settings.similarityMaxSuggestions,
  });
  const answerResults = results.filter((result) => result.score >= thresholdMedium);
  const context = found
    ? buildRagContext(answerResults, {
        media: enrichment.media,
        attachments: enrichment.attachments,
      })
    : null;

  // ---- Efek samping (best-effort, tidak menggagalkan respons) ----

  // 1) Chat memory — simpan pesan USER bila ada sessionId.
  let conversationRecorded = false;
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
      conversationRecorded = true;
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

  // Counter handoff terpisah dari timesAsked (yang merupakan agregat global
  // per pertanyaan). State ini adalah streak berturut-turut per session/sender.
  const handoffState = await recordRagHandoffState({
    found,
    sessionId,
    sender,
    enabled: settings.humanHandoffEnabled,
    afterUnanswered: settings.humanHandoffAfterUnanswered,
  });

  // 3) Retrieval log untuk analitik.
  try {
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
      thresholdHigh,
      thresholdMedium,
      resultCount: results.length,
    });
  } catch (err) {
    console.error("[rag/context] Gagal menyimpan retrieval_logs:", err);
  }

  const thresholds = { high: thresholdHigh, medium: thresholdMedium };

  await logBotEventBestEffort({
    type: found ? "RAG_FOUND" : "RAG_NOT_FOUND",
    question: message,
    route: "QUESTION",
    matchedFaqId: found && results[0]?.type === "FAQ" ? results[0].id : null,
    confidence,
    score: topScore,
  });
  if (found && results[0]?.type === "FAQ") {
    await logBotEventBestEffort({
      type: "FAQ_MATCH",
      question: message,
      route: "QUESTION",
      matchedFaqId: results[0].id,
      confidence,
      score: topScore,
    });
  }
  if (enrichment.suggestions.length > 0) {
    await logBotEventBestEffort({
      type: "SIMILAR_SUGGESTION",
      question: message,
      route: "QUESTION",
      confidence,
      score: topScore,
      metadata: { count: enrichment.suggestions.length },
    });
  }

  if (found) {
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
      conversationRecorded,
      thresholds,
    });
  }

  const fallbackMenu = settings.showMenuOnNotFound
    ? (await getBotMenu(settings)).items.map(({ number, faqId, question }) => ({
        number,
        faqId,
        question,
      }))
    : [];
  const requiresHuman = handoffState.requiresHuman;

  return NextResponse.json({
    success: true,
    found: false,
    confidence: "LOW",
    score: Number(topScore.toFixed(4)),
    context: null,
    sources: [],
    suggestions: settings.showSuggestionsOnNotFound
      ? enrichment.suggestions
      : [],
    media: [],
    attachments: [],
    requiresHuman,
    conversationRecorded,
    message: settings.notFoundMessage,
    menu: fallbackMenu,
    handoff: buildHandoffDetails(handoffState.includeDetails, {
      message: settings.humanHandoffMessage,
      phone: settings.humanHandoffPhone,
      url: settings.humanHandoffUrl,
    }),
    handoffCooldown: {
      streak: handoffState.streak,
      detailsSuppressed: requiresHuman && !handoffState.includeDetails,
    },
    thresholds,
  });
}
