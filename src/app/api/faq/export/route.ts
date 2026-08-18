import { asc, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { knowledgeItems } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { getAdminApiUser } from "@/lib/server/route-auth";
import {
  buildCsv,
  buildXlsxBuffer,
  EXPORT_HEADERS,
  exportRowToCells,
  type ExportFaqRow,
} from "@/services/faq/export";

export const dynamic = "force-dynamic";

/**
 * GET /api/faq/export?format=xlsx|csv — ekspor seluruh FAQ (format sama dengan
 * import, sehingga Export → edit → Import berjalan). Otorisasi sesi admin.
 */
export async function GET(request: Request) {
  const { user, error } = await getAdminApiUser();
  if (error) return error;

  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "xlsx";

  const items = await db.query.knowledgeItems.findMany({
    where: isNull(knowledgeItems.deletedAt),
    orderBy: asc(knowledgeItems.question),
    columns: {
      question: true,
      answer: true,
      audience: true,
      status: true,
      keywords: true,
      sourceUrl: true,
      internalNote: true,
    },
    with: {
      category: { columns: { name: true } },
      source: { columns: { title: true } },
      alternatives: { columns: { question: true } },
      itemSources: { columns: { title: true, url: true } },
      relatedQuestions: { columns: { question: true } },
      media: { columns: { caption: true, url: true } },
      attachments: { columns: { title: true, type: true, url: true } },
    },
  });

  const rows: ExportFaqRow[] = items.map((item) => ({
    question: item.question,
    answer: item.answer,
    category: item.category?.name ?? "",
    audience: item.audience,
    status: item.status,
    keywords: item.keywords ?? [],
    referenceUrl: item.sourceUrl ?? "",
    primarySource: item.source?.title ?? "",
    officialSources: item.itemSources.map((s) => ({
      title: s.title,
      url: s.url ?? "",
    })),
    relatedQuestions: item.relatedQuestions
      .map((r) => r.question ?? "")
      .filter((q) => q.length > 0),
    alternativeQuestions: item.alternatives.map((a) => a.question),
    media: item.media.map((m) => ({ caption: m.caption ?? "", url: m.url ?? "" })),
    attachments: item.attachments.map((a) => ({
      title: a.title,
      type: a.type,
      url: a.url ?? "",
    })),
    internalNote: item.internalNote ?? "",
  }));

  const cells = rows.map(exportRowToCells);

  await logAudit({
    user,
    action: "EXPORT",
    entity: "FAQ",
    newData: { format, count: rows.length },
  });

  if (format === "csv") {
    const csv = buildCsv(EXPORT_HEADERS, cells);
    return new Response("﻿" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="faq-export.csv"',
        "Cache-Control": "no-store",
      },
    });
  }

  const buffer = await buildXlsxBuffer("FAQ", EXPORT_HEADERS, cells);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="faq-export.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
