import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, clientIp } from "@/lib/server/api-errors";
import { verifyInternalApiKey } from "@/lib/server/internal-auth";
import { rateLimit } from "@/lib/server/rate-limit";
import { resolveBotMessage } from "@/services/bot/resolver";

export const dynamic = "force-dynamic";

const schema = z.object({ message: z.string().trim().min(1).max(2000) });

export async function POST(request: Request) {
  if (!verifyInternalApiKey(request)) {
    return apiError(401, "UNAUTHORIZED", "API key tidak valid.");
  }
  const rl = rateLimit(`bot-resolve:${clientIp(request)}`);
  if (!rl.allowed) {
    return apiError(429, "RATE_LIMITED", "Terlalu banyak permintaan, coba lagi nanti.");
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "VALIDATION_ERROR", "Body harus JSON.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Parameter message tidak valid.");
  }
  return NextResponse.json(await resolveBotMessage(parsed.data.message));
}

