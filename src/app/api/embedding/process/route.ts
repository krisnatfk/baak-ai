import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, clientIp } from "@/lib/server/api-errors";
import { verifyInternalApiKey } from "@/lib/server/internal-auth";
import { rateLimit } from "@/lib/server/rate-limit";
import { getEmbeddingConfig } from "@/lib/env";
import { processEmbeddingQueue } from "@/services/embedding/worker";

export const dynamic = "force-dynamic";

const processSchema = z.object({
  batchSize: z.number().int().min(1).max(200).optional(),
});

/**
 * POST /api/embedding/process — drain antrian embedding (n8n / loop).
 *
 * Internal API: wajib `Authorization: Bearer ${INTERNAL_API_KEY}`.
 * Memproses batch FAQ + chunk dokumen berstatus PENDING → COMPLETED/FAILED.
 */
export async function POST(request: Request) {
  if (!verifyInternalApiKey(request)) {
    return apiError(401, "UNAUTHORIZED", "API key tidak valid.");
  }

  const ip = clientIp(request);
  const rl = rateLimit(`embedding:${ip}`);
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
  const parsed = processSchema.safeParse(json);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Parameter tidak valid.");
  }

  const result = await processEmbeddingQueue({
    batchSize: parsed.data.batchSize,
  });

  return NextResponse.json({
    success: true,
    batchSize: parsed.data.batchSize ?? getEmbeddingConfig().batchSize,
    ...result,
  });
}
