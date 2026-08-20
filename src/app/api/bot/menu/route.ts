import { NextResponse } from "next/server";
import { clientIp } from "@/lib/server/api-errors";
import { verifyInternalApiKey } from "@/lib/server/internal-auth";
import { rateLimit } from "@/lib/server/rate-limit";
import { getBotSettings } from "@/lib/server/bot-settings";
import { getBotMenu } from "@/services/bot/menu";

export const dynamic = "force-dynamic";

/** GET /api/bot/menu â€” backward-compatible menu + metadata control center. */
export async function GET(request: Request) {
  if (!verifyInternalApiKey(request)) {
    return NextResponse.json(
      { success: false, error: "UNAUTHORIZED", message: "API key tidak valid." },
      { status: 401 },
    );
  }
  const rl = rateLimit(`menu:${clientIp(request)}`);
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "RATE_LIMITED", message: "Terlalu banyak permintaan, coba lagi nanti." },
      { status: 429 },
    );
  }

  const settings = await getBotSettings();
  const { mode, items } = await getBotMenu(settings);
  return NextResponse.json({
    success: true,
    mode,
    items,
    // Field lama tetap dipertahankan agar workflow existing tidak rusak.
    menu: items,
  });
}

