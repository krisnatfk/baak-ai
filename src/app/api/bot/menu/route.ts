import { NextResponse } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { clientIp } from "@/lib/server/api-errors";
import { verifyInternalApiKey } from "@/lib/server/internal-auth";
import { rateLimit } from "@/lib/server/rate-limit";
import { db } from "@/db/client";
import { knowledgeCategories, knowledgeItems } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * GET /api/bot/menu — menu WhatsApp dari kategori yang aktif.
 *
 * Internal API: wajib `Authorization: Bearer ${INTERNAL_API_KEY}`.
 * Hanya kategori dengan `isActive = true` DAN `showInBotMenu = true` yang
 * dikembalikan (data dari DB, bukan hardcode). `faqCount` = jumlah FAQ aktif
 * pada kategori (membantu bot menyembunyikan kategori kosong).
 */
export async function GET(request: Request) {
  if (!verifyInternalApiKey(request)) {
    return NextResponse.json(
      { success: false, error: "UNAUTHORIZED", message: "API key tidak valid." },
      { status: 401 },
    );
  }

  const ip = clientIp(request);
  const rl = rateLimit(`menu:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "RATE_LIMITED", message: "Terlalu banyak permintaan, coba lagi nanti." },
      { status: 429 },
    );
  }

  const [categories, counts] = await Promise.all([
    db.query.knowledgeCategories.findMany({
      where: and(
        eq(knowledgeCategories.isActive, true),
        eq(knowledgeCategories.showInBotMenu, true),
      ),
      columns: { id: true, name: true, slug: true, description: true, color: true },
      orderBy: (t, { asc }) => asc(t.name),
    }),
    // Jumlah FAQ aktif per kategori — satu query agregat untuk semua kategori.
    db
      .select({ categoryId: knowledgeItems.categoryId, count: sql<number>`count(*)::int` })
      .from(knowledgeItems)
      .where(
        and(
          eq(knowledgeItems.status, "ACTIVE"),
          isNull(knowledgeItems.deletedAt),
        ),
      )
      .groupBy(knowledgeItems.categoryId),
  ]);

  const countByCategory = new Map(
    counts
      .filter((row) => row.categoryId != null)
      .map((row) => [row.categoryId as string, Number(row.count)]),
  );

  const menu = categories.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description ?? null,
    color: c.color ?? null,
    faqCount: countByCategory.get(c.id) ?? 0,
  }));

  return NextResponse.json({ success: true, menu });
}
