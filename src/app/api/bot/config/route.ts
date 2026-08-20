import { NextResponse } from "next/server";
import { clientIp } from "@/lib/server/api-errors";
import { verifyInternalApiKey } from "@/lib/server/internal-auth";
import { rateLimit } from "@/lib/server/rate-limit";
import { getBotSettings } from "@/lib/server/bot-settings";

export const dynamic = "force-dynamic";

/** GET /api/bot/config â€” hanya konfigurasi runtime aman, tanpa secret. */
export async function GET(request: Request) {
  if (!verifyInternalApiKey(request)) {
    return NextResponse.json(
      { success: false, error: "UNAUTHORIZED", message: "API key tidak valid." },
      { status: 401 },
    );
  }
  const rl = rateLimit(`bot-config:${clientIp(request)}`);
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "RATE_LIMITED", message: "Terlalu banyak permintaan, coba lagi nanti." },
      { status: 429 },
    );
  }
  return NextResponse.json({ success: true, config: await getBotSettings() });
}

