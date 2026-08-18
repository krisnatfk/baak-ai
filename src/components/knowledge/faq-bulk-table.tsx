"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil, RefreshCw } from "lucide-react";
import { AUDIENCE_VALUES } from "@/db/constants";
import { bulkFaqAction } from "@/lib/server/actions/faq-import";
import { retryEmbedding } from "@/lib/server/actions/knowledge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  AUDIENCE_LABEL,
  EmbeddingStatusBadge,
  KnowledgeStatusBadge,
} from "./badges";

export interface FaqTableItem {
  id: string;
  question: string;
  categoryName: string | null;
  categoryColor: string | null;
  sourceTitle: string | null;
  audience: string;
  status: string;
  embeddingStatus: string;
  embeddingError: string | null;
}

export interface FaqCategoryOption {
  id: string;
  name: string;
}

interface FaqBulkTableProps {
  items: FaqTableItem[];
  categories: FaqCategoryOption[];
  canWrite: boolean;
}

/** Tabel FAQ dengan checkbox pilihan massal + toolbar aksi massal. */
export function FaqBulkTable({ items, categories, canWrite }: FaqBulkTableProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const allSelected =
    items.length > 0 && items.every((it) => selected.has(it.id));
  const someSelected = selected.size > 0;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(items.map((it) => it.id)));
  }

  function runBulk(action: string, payload?: Record<string, unknown>) {
    startTransition(async () => {
      const res = await bulkFaqAction({
        ids: [...selected],
        action,
        ...payload,
      });
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
      setSelected(new Set());
      router.refresh();
    });
  }

  if (!canWrite) {
    return (
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pertanyaan</TableHead>
              <TableHead className="hidden md:table-cell">Kategori</TableHead>
              <TableHead className="hidden lg:table-cell">Audiens</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Embedding</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{renderRows(items, null, null, null)}</TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      {/* Toolbar aksi massal */}
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <Checkbox
          checked={allSelected}
          onCheckedChange={toggleAll}
          aria-label="Pilih semua"
        />
        <span className="text-xs text-muted-foreground">
          {selected.size} dipilih
        </span>
        {someSelected && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => runBulk("publish")}
            >
              Publish
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => runBulk("draft")}
            >
              Draft
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => runBulk("archive")}
            >
              Archive
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => runBulk("reembed")}
            >
              Re-embed
            </Button>
            <Select
              onValueChange={(v) => runBulk("change_category", { categoryId: v })}
            >
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue placeholder="Ubah Kategori" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              onValueChange={(v) => runBulk("change_audience", { audience: v })}
            >
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue placeholder="Ubah Audiens" />
              </SelectTrigger>
              <SelectContent>
                {AUDIENCE_VALUES.map((a) => (
                  <SelectItem key={a} value={a}>
                    {AUDIENCE_LABEL[a] ?? a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive" disabled={pending}>
                  Hapus
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Hapus FAQ terpilih?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {selected.size} FAQ akan dihapus secara lunak (tidak lagi
                    muncul di pencarian bot). Tindakan ini dicatat di audit log.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={pending}
                    onClick={(e) => {
                      e.preventDefault();
                      setConfirmDelete(false);
                      runBulk("delete");
                    }}
                    className="bg-destructive text-white hover:bg-destructive/90"
                  >
                    {pending && <Loader2 className="size-4 animate-spin" />}
                    Hapus
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            <TableHead>Pertanyaan</TableHead>
            <TableHead className="hidden md:table-cell">Kategori</TableHead>
            <TableHead className="hidden lg:table-cell">Audiens</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Embedding</TableHead>
            <TableHead className="text-right">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {renderRows(
            items,
            selected,
            toggle,
            (id) => (
              <RowActions
                id={id}
                embeddingStatus={items.find((i) => i.id === id)?.embeddingStatus ?? ""}
              />
            ),
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function RowActions({
  id,
  embeddingStatus,
}: {
  id: string;
  embeddingStatus: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleRetry() {
    startTransition(async () => {
      const res = await retryEmbedding(id);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="ghost" size="icon-sm" asChild title="Edit FAQ">
        <Link href={`/knowledge/faq/${id}/edit`}>
          <Pencil className="size-4" />
        </Link>
      </Button>
      {embeddingStatus === "FAILED" && (
        <Button
          variant="ghost"
          size="icon-sm"
          title="Ulangi embedding"
          disabled={pending}
          onClick={handleRetry}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
        </Button>
      )}
    </div>
  );
}

function renderRows(
  items: FaqTableItem[],
  selected: Set<string> | null,
  toggle: ((id: string) => void) | null,
  actions: ((id: string) => React.ReactNode) | null,
) {
  if (items.length === 0) {
    return (
      <TableRow>
        <TableCell
          colSpan={7}
          className="h-24 text-center text-sm text-muted-foreground"
        >
          Belum ada FAQ dengan filter ini.
        </TableCell>
      </TableRow>
    );
  }
  return items.map((item) => (
    <TableRow key={item.id}>
      {selected && toggle && (
        <TableCell>
          <Checkbox
            checked={selected.has(item.id)}
            onCheckedChange={() => toggle(item.id)}
            aria-label={`Pilih ${item.question}`}
          />
        </TableCell>
      )}
      <TableCell className="max-w-md">
        <div className="line-clamp-2 font-medium">{item.question}</div>
        {item.sourceTitle && (
          <div className="mt-0.5 text-xs text-muted-foreground">
            Sumber: {item.sourceTitle}
          </div>
        )}
      </TableCell>
      <TableCell className="hidden md:table-cell">
        {item.categoryName ? (
          <Badge
            variant="outline"
            className="font-normal"
            style={
              item.categoryColor
                ? {
                    borderColor: `${item.categoryColor}40`,
                    color: item.categoryColor,
                  }
                : undefined
            }
          >
            {item.categoryName}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        <span className="text-sm">
          {AUDIENCE_LABEL[item.audience] ?? item.audience}
        </span>
      </TableCell>
      <TableCell>
        <KnowledgeStatusBadge status={item.status} />
      </TableCell>
      <TableCell>
        <EmbeddingStatusBadge
          status={item.embeddingStatus}
          error={item.embeddingError}
        />
      </TableCell>
      <TableCell className="text-right">
        {actions ? (
          actions(item.id)
        ) : (
          <span className="text-xs text-muted-foreground">Hanya baca</span>
        )}
      </TableCell>
    </TableRow>
  ));
}
