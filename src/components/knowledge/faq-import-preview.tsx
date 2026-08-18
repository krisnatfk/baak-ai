"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { commitFaqImport } from "@/lib/server/actions/faq-import";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type PreviewValidation = "VALID" | "WARNING" | "ERROR" | "DUPLICATE";

export interface PreviewRowItem {
  id: string;
  rowIndex: number;
  question: string;
  category: string;
  audience: string;
  status: string;
  validationStatus: PreviewValidation;
  message: string | null;
  duplicateKind: "EXACT" | "SEMANTIC" | null;
  matchedQuestion: string | null;
}

interface FaqImportPreviewProps {
  batchId: string;
  rows: PreviewRowItem[];
  categories: { id: string; name: string }[];
  unknownCategories: string[];
  counts: {
    total: number;
    valid: number;
    warning: number;
    error: number;
    duplicate: number;
  };
}

const STATUS_STYLE: Record<PreviewValidation, string> = {
  VALID: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  WARNING: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  ERROR: "bg-destructive/10 text-destructive",
  DUPLICATE: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
};
const STATUS_LABEL: Record<PreviewValidation, string> = {
  VALID: "Valid",
  WARNING: "Warning",
  ERROR: "Error",
  DUPLICATE: "Duplikat",
};

/** Preview import: resolusi kategori & duplikat + tombol import. */
export function FaqImportPreview({
  batchId,
  rows,
  categories,
  unknownCategories,
  counts,
}: FaqImportPreviewProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [catRes, setCatRes] = useState<Record<string, string>>({});
  const [dupRes, setDupRes] = useState<Record<number, string>>({});

  function commit() {
    const catPayload: Record<string, { action: string; categoryId?: string }> =
      {};
    for (const name of unknownCategories) {
      const v = catRes[name] ?? "skip";
      if (v === "create") catPayload[name] = { action: "create" };
      else if (v === "skip") catPayload[name] = { action: "skip" };
      else catPayload[name] = { action: "map", categoryId: v };
    }

    const dupPayload: Record<string, { action: string }> = {};
    for (const [idx, action] of Object.entries(dupRes)) {
      if (action && action !== "skip") dupPayload[idx] = { action };
    }

    startTransition(async () => {
      const res = await commitFaqImport({
        batchId,
        categories: catPayload,
        duplicates: dupPayload,
      });
      if (res.ok) {
        toast.success(res.message);
        router.push("/knowledge/faq/import-history");
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  }

  const summary = [
    { label: "Total", value: counts.total },
    { label: "Valid", value: counts.valid },
    { label: "Warning", value: counts.warning },
    { label: "Error", value: counts.error },
    { label: "Duplikat", value: counts.duplicate },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Ringkasan */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {summary.map((s) => (
          <div key={s.label} className="rounded-lg border bg-card p-3">
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className="text-2xl font-semibold">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Resolusi kategori (belum ditemukan) */}
      {unknownCategories.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <h3 className="mb-2 text-sm font-medium">Resolusi Kategori</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Kategori berikut belum ada di database. Pilih petakan ke kategori
            yang sudah ada, buat baru, atau lewati.
          </p>
          <div className="flex flex-col gap-2">
            {unknownCategories.map((name) => (
              <div key={name} className="flex flex-wrap items-center gap-2">
                <span className="w-48 truncate text-sm font-medium">
                  {name}
                </span>
                <select
                  value={catRes[name] ?? "skip"}
                  onChange={(e) =>
                    setCatRes((prev) => ({ ...prev, [name]: e.target.value }))
                  }
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="skip">Lewati</option>
                  <option value="create">Buat kategori baru</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      Petakan ke {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabel preview */}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">No</TableHead>
              <TableHead>Pertanyaan</TableHead>
              <TableHead className="hidden md:table-cell">Kategori</TableHead>
              <TableHead className="hidden lg:table-cell">Audiens</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Validasi</TableHead>
              <TableHead className="hidden lg:table-cell">Catatan</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  Tidak ada baris dengan filter ini.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-muted-foreground">
                    {row.rowIndex}
                  </TableCell>
                  <TableCell className="max-w-md">
                    <div className="line-clamp-2 font-medium">
                      {row.question || "—"}
                    </div>
                    {row.validationStatus === "DUPLICATE" &&
                      row.matchedQuestion && (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {row.duplicateKind === "EXACT"
                            ? "Duplikat:"
                            : "Kemungkinan duplikat:"}{" "}
                          {row.matchedQuestion}
                        </div>
                      )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {row.category || "—"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {row.audience || "—"}
                  </TableCell>
                  <TableCell>{row.status || "DRAFT"}</TableCell>
                  <TableCell>
                    <Badge
                      className={cn(
                        "border-transparent",
                        STATUS_STYLE[row.validationStatus],
                      )}
                    >
                      {STATUS_LABEL[row.validationStatus]}
                    </Badge>
                    {row.validationStatus === "DUPLICATE" && (
                      <select
                        value={dupRes[row.rowIndex] ?? "skip"}
                        onChange={(e) =>
                          setDupRes((prev) => ({
                            ...prev,
                            [row.rowIndex]: e.target.value,
                          }))
                        }
                        className="mt-1 h-8 rounded-md border border-input bg-background px-2 text-xs"
                      >
                        <option value="skip">Skip</option>
                        {row.duplicateKind === "SEMANTIC" && (
                          <option value="import_anyway">Import Anyway</option>
                        )}
                        {row.duplicateKind === "EXACT" && (
                          <>
                            <option value="merge">Merge</option>
                            <option value="replace">Replace</option>
                          </>
                        )}
                      </select>
                    )}
                  </TableCell>
                  <TableCell className="hidden max-w-xs text-xs text-muted-foreground lg:table-cell">
                    {row.message ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Aksi */}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => router.push("/knowledge/faq/import-history")}
        >
          Batal
        </Button>
        <Button disabled={pending || counts.valid + counts.warning === 0} onClick={commit}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Import Semua yang Valid
        </Button>
      </div>
    </div>
  );
}
