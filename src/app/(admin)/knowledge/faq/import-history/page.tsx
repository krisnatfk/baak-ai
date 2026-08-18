import Link from "next/link";
import { desc } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db/client";
import { faqImportBatches } from "@/db/schema";
import { requireUser } from "@/lib/guards";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  PROCESSING: "Diproses",
  COMPLETED: "Selesai",
  FAILED: "Gagal",
  ROLLED_BACK: "Di-rollback",
};

const STATUS_STYLE: Record<string, string> = {
  PROCESSING: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  COMPLETED: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  FAILED: "bg-destructive/10 text-destructive",
  ROLLED_BACK: "bg-muted text-muted-foreground",
};

export default async function FaqImportHistoryPage() {
  const user = await requireUser();
  if (user.roleKey === "VIEWER") {
    return (
      <p className="text-sm text-muted-foreground">
        Anda tidak memiliki izin untuk melihat riwayat import.
      </p>
    );
  }

  const batches = await db.query.faqImportBatches.findMany({
    orderBy: desc(faqImportBatches.createdAt),
    with: { createdBy: { columns: { name: true, email: true } } },
    limit: 100,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Import History
          </h1>
          <p className="text-sm text-muted-foreground">
            Riwayat bulk import FAQ beserta hasil &amp; opsi rollback.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/knowledge/faq/import">
            <ArrowLeft className="size-4" /> Import Baru
          </Link>
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Batch</TableHead>
              <TableHead>File</TableHead>
              <TableHead className="hidden lg:table-cell">Tanggal</TableHead>
              <TableHead className="hidden md:table-cell">User</TableHead>
              <TableHead className="text-center">Total</TableHead>
              <TableHead className="text-center">Sukses</TableHead>
              <TableHead className="text-center">Lewati</TableHead>
              <TableHead className="text-center">Error</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {batches.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  Belum ada riwayat import.
                </TableCell>
              </TableRow>
            ) : (
              batches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono text-xs">
                    {b.batchCode}
                  </TableCell>
                  <TableCell className="max-w-[180px] truncate text-sm">
                    {b.fileName}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                    {b.createdAt.toLocaleString("id-ID", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </TableCell>
                  <TableCell className="hidden text-sm md:table-cell">
                    {b.createdBy?.name ?? b.createdBy?.email ?? "—"}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    {b.totalRows}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    {b.importedCount}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    {b.skippedCount}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    {b.failedCount}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={cn(
                        "border-transparent",
                        STATUS_STYLE[b.status] ?? "bg-muted text-muted-foreground",
                      )}
                    >
                      {STATUS_LABEL[b.status] ?? b.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/knowledge/faq/import-history/${b.id}`}>
                        Detail
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
