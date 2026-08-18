import { asc } from "drizzle-orm";
import { db } from "@/db/client";
import { knowledgeCategories } from "@/db/schema";
import { getAdminApiUser } from "@/lib/server/route-auth";
import { buildTemplateBuffer } from "@/services/faq/export";

export const dynamic = "force-dynamic";

/**
 * GET /api/faq/import/template — unduh template XLSX import FAQ.
 * Otorisasi: sesi admin (ADMIN/SUPER_ADMIN), bukan INTERNAL_API_KEY.
 */
export async function GET() {
  const { error } = await getAdminApiUser();
  if (error) return error;

  const categories = await db
    .select({ name: knowledgeCategories.name })
    .from(knowledgeCategories)
    .orderBy(asc(knowledgeCategories.name));

  const buffer = await buildTemplateBuffer(categories.map((c) => c.name));

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="faq-import-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
