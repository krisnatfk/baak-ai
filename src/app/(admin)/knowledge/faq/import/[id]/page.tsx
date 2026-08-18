import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import {
  faqImportBatches,
  faqImportRows,
  knowledgeCategories,
} from "@/db/schema";
import { requireUser } from "@/lib/guards";
import { Button } from "@/components/ui/button";
import {
  FaqImportPreview,
  type PreviewRowItem,
} from "@/components/knowledge/faq-import-preview";
import type { ParsedFaqRow } from "@/services/faq/import-parser";

export const dynamic = "force-dynamic";

const FILTERS = ["all", "valid", "warning", "error", "duplicate"] as const;

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filter?: string; page?: string }>;
}

function parseDuplicateMeta(raw: string | null): {
  kind: "EXACT" | "SEMANTIC" | null;
  matchedQuestion: string | null;
} {
  if (!raw) return { kind: null, matchedQuestion: null };
  try {
    const o = JSON.parse(raw) as {
      kind?: "EXACT" | "SEMANTIC";
      matchedQuestion?: string;
    };
    return { kind: o.kind ?? null, matchedQuestion: o.matchedQuestion ?? null };
  } catch {
    return { kind: null, matchedQuestion: null };
  }
}

export default async function FaqImportPreviewPage({
  params,
  searchParams,
}: PageProps) {
  const user = await requireUser();
  if (user.roleKey === "VIEWER") {
    return (
      <p className="text-sm text-muted-foreground">
        Anda tidak memiliki izin untuk mengimpor FAQ.
      </p>
    );
  }

  const { id } = await params;
  const sp = await searchParams;
  const filter = FILTERS.includes(sp.filter as never)
    ? (sp.filter as (typeof FILTERS)[number])
    : "all";
  const page = Math.max(1, Number(sp.page) || 1);
  const PAGE_SIZE = 25;

  const batch = await db.query.faqImportBatches.findFirst({
    where: eq(faqImportBatches.id, id),
  });
  if (!batch) notFound();

  const statusFilter =
    filter === "all"
      ? undefined
      : eq(
          faqImportRows.validationStatus,
          filter.toUpperCase() as
            | "VALID"
            | "WARNING"
            | "ERROR"
            | "DUPLICATE",
        );

  const where = and(eq(faqImportRows.batchId, id), statusFilter);

  const [total, rows, categories, warningRows] = await Promise.all([
    db.$count(faqImportRows, where),
    db
      .select()
      .from(faqImportRows)
      .where(where)
      .orderBy(asc(faqImportRows.rowIndex))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ id: knowledgeCategories.id, name: knowledgeCategories.name })
      .from(knowledgeCategories)
      .orderBy(asc(knowledgeCategories.name)),
    db
      .select({ data: faqImportRows.data })
      .from(faqImportRows)
      .where(eq(faqImportRows.batchId, id)),
  ]);

  const unknownCategories = [
    ...new Set(
      warningRows
        .map((r) => (r.data as unknown as ParsedFaqRow)?.category?.trim() ?? "")
        .filter((c) => c.length > 0),
    ),
  ];

  const previewRows: PreviewRowItem[] = rows.map((row) => {
    const data = row.data as unknown as ParsedFaqRow;
    const dup = parseDuplicateMeta(row.duplicateOf);
    return {
      id: row.id,
      rowIndex: row.rowIndex,
      question: data.question ?? "",
      category: data.category ?? "",
      audience: data.audience ?? "",
      status: data.status ?? "",
      validationStatus: row.validationStatus,
      message: row.message,
      duplicateKind: dup.kind,
      matchedQuestion: dup.matchedQuestion,
    };
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hrefFor = (p: number) =>
    `/knowledge/faq/import/${id}?filter=${filter}&page=${p}`;

  if (batch.status !== "PROCESSING") {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">
            Preview Import — {batch.batchCode}
          </h1>
          <Button variant="outline" asChild>
            <Link href="/knowledge/faq/import-history">Kembali ke History</Link>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Batch ini sudah {batch.status === "COMPLETED" ? "diimpor" : "di-rollback"}.
          Tidak ada aksi yang tersedia.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Preview Import
          </h1>
          <p className="text-sm text-muted-foreground">
            {batch.batchCode} · {batch.fileName} · {batch.totalRows} baris
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/knowledge/faq/import-history">Import History</Link>
        </Button>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-1 overflow-x-auto">
        {FILTERS.map((f) => {
          const label =
            f === "all"
              ? `Semua (${batch.totalRows})`
              : f === "valid"
                ? `Valid (${batch.validCount})`
                : f === "warning"
                  ? `Warning (${batch.warningCount})`
                  : f === "error"
                    ? `Error (${batch.errorCount})`
                    : `Duplikat (${batch.duplicateCount})`;
          const active = filter === f;
          return (
            <Link
              key={f}
              href={`/knowledge/faq/import/${id}?filter=${f}`}
              className={
                active
                  ? "inline-flex shrink-0 items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                  : "inline-flex shrink-0 items-center rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              }
            >
              {label}
            </Link>
          );
        })}
      </div>

      <FaqImportPreview
        batchId={id}
        rows={previewRows}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        unknownCategories={unknownCategories}
        counts={{
          total: batch.totalRows,
          valid: batch.validCount,
          warning: batch.warningCount,
          error: batch.errorCount,
          duplicate: batch.duplicateCount,
        }}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Halaman {page} dari {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              asChild={page > 1}
            >
              {page > 1 ? (
                <Link href={hrefFor(page - 1)}>Sebelumnya</Link>
              ) : (
                <span>Sebelumnya</span>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              asChild={page < totalPages}
            >
              {page < totalPages ? (
                <Link href={hrefFor(page + 1)}>Berikutnya</Link>
              ) : (
                <span>Berikutnya</span>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
