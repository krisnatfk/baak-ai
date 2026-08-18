import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, clientIp } from "@/lib/server/api-errors";
import { verifyInternalApiKey } from "@/lib/server/internal-auth";
import { rateLimit } from "@/lib/server/rate-limit";
import { getRagConfig } from "@/lib/env";
import { logRetrieval } from "@/lib/server/retrieval";
import { semanticSearch } from "@/services/rag/search";

export const dynamic = "force-dynamic";

const searchSchema = z.object({
  query: z.string().trim().min(1, "query wajib diisi").max(1000),
  limit: z.number().int().min(1).max(20).optional(),
});

/**
 * POST /api/rag/search — pencarian semantik mentah (top-K).
 *
 * Internal API: wajib `Authorization: Bearer ${INTERNAL_API_KEY}`.
 * Dipakai untuk debugging/testing; n8n umumnya memakai /api/rag/context.
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
  const parsed = searchSchema.safeParse(json);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Parameter tidak valid.");
  }
  const { query, limit } = parsed.data;

  const ragConfig = getRagConfig();
  const { results, embedTimeMs, searchTimeMs } = await semanticSearch(query, limit);

  // Efek samping (best-effort): catat retrieval untuk analitik.
  try {
    await logRetrieval({
      query,
      embedTimeMs,
      searchTimeMs,
      topScore: results[0]?.score ?? null,
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
    console.error("[rag/search] Gagal menyimpan retrieval_logs:", err);
  }

  return NextResponse.json({
    success: true,
    query,
    results: results.map((r) => ({
      id: r.id,
      type: r.type,
      question: r.question ?? null,
      answer: r.answer,
      category: r.category ?? null,
      source: r.source ?? null,
      url: r.url ?? null,
      score: Number(r.score.toFixed(4)),
    })),
  });
}
