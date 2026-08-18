import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db/client";
import { faqImportBatches, knowledgeItems } from "@/db/schema";
import { requireUser } from "@/lib/guards";
import { Button } from "@/components/ui/button";
import { FaqImportRollback } from "@/components/knowledge/faq-import-rollback";
import {
  KnowledgeStatusBadge,
} from "@/components/knowledge/badges";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function FaqImportHistoryDetailPage({ params }: PageProps) {
  const user = await requireUser();
  if (user.roleKey === "VIEWER") {
    return (
      <p className="text-sm text-muted-foreground">
        Anda tidak memiliki izin untuk melihat detail import.
      </p>
    );
  }

  const { id } = await params;
  const batch = await db.query.faqImportBatches.findFirst({
    where: eq(faqImportBatches.id, id),
    with: { createdBy: { columns: { name: true, email: true } } },
  });
  if (!batch) notFound();

  const items = await db.query.knowledgeItems.findMany({
    where: and(
      eq(knowledgeItems.importBatchId, id),
      isNull(knowledgeItems.deletedAt),
    ),
    orderBy: desc(knowledgeItems.createdAt),
    limit: 200,
    columns: { id: true, question: true, status: true },
  });

  const rows = [
    ["Total baris", batch.totalRows],
    ["Valid", batch.validCount],
    ["Warning", batch.warningCount],
    ["Error", batch.errorCount],
    ["Duplikat", batch.duplicateCount],
    ["Terimpor", batch.importedCount],
    ["Dilewati", batch.skippedCount],
    ["Gagal", batch.failedCount],
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {batch.batchCode}
          </h1>
          <p className="text-sm text-muted-foreground">
            {batch.fileName} ·{" "}
            {batch.createdAt.toLocaleString("id-ID", {
              dateStyle: "medium",
              timeStyle: "short",
            })}{" "}
            · {batch.createdBy?.name ?? batch.createdBy?.email ?? "—"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {batch.status === "COMPLETED" && (
            <FaqImportRollback batchId={batch.id} />
          )}
          <Button variant="outline" asChild>
            <Link href="/knowledge/faq/import-history">
              <ArrowLeft className="size-4" /> Kembali
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-lg border bg-card p-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-xl font-semibold">{value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-medium">
            FAQ yang diimpor dari batch ini
          </h2>
        </div>
        <div className="divide-y">
          {items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              Tidak ada FAQ (mungkin sudah di-rollback).
            </p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-2">
                <Link
                  href={`/knowledge/faq/${item.id}/edit`}
                  className="line-clamp-1 text-sm hover:underline"
                >
                  {item.question}
                </Link>
                <KnowledgeStatusBadge status={item.status} />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
