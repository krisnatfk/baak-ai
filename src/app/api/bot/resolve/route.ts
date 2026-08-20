import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, clientIp } from "@/lib/server/api-errors";
import { verifyInternalApiKey } from "@/lib/server/internal-auth";
import { rateLimit } from "@/lib/server/rate-limit";
import { recordChatMessage } from "@/lib/server/chat";
import { resolveBotMessage } from "@/services/bot/resolver";

export const dynamic = "force-dynamic";

const schema = z.object({
  message: z.string().trim().min(1).max(2000),
  sessionId: z.string().trim().max(191).nullish(),
  session_id: z.string().trim().max(191).nullish(),
  chatId: z.string().trim().max(191).nullish(),
  sender: z.string().trim().max(50).nullish(),
  senderId: z.string().trim().max(50).nullish(),
  from: z.string().trim().max(50).nullish(),
});

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
  const result = await resolveBotMessage(parsed.data.message);
  const sender = parsed.data.sender ?? parsed.data.senderId ?? parsed.data.from ?? null;
  const sessionId =
    parsed.data.sessionId ??
    parsed.data.session_id ??
    parsed.data.chatId ??
    (sender ? `sender:${sender}` : null);
  let conversationRecorded = false;

  // QUESTION akan dicatat oleh /api/rag/context agar tidak tersimpan dua kali.
  // WELCOME berhenti di resolver, jadi USER + balasan deterministik harus
  // dicatat di sini supaya greeting/noise tidak hilang dari Percakapan.
  if (sessionId && result.route === "WELCOME") {
    try {
      await recordChatMessage({
        sessionId,
        sender,
        channel: "WHATSAPP",
        role: "USER",
        content: parsed.data.message,
        topic: parsed.data.message,
        metadata: { source: "BOT_RESOLVE", route: result.route, reason: result.reason },
      });
      if (result.responseText) {
        await recordChatMessage({
          sessionId,
          sender,
          channel: "WHATSAPP",
          role: "AI",
          content: result.responseText,
          metadata: { source: "BOT_RESOLVE", route: result.route, reason: result.reason },
        });
      }
      conversationRecorded = true;
    } catch (error) {
      console.error("[bot/resolve] Gagal menyimpan percakapan:", error);
    }
  }

  return NextResponse.json({ ...result, conversationRecorded });
}
