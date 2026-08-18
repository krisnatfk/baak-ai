"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { deleteFaq, retryEmbedding } from "@/lib/server/actions/knowledge";

interface FaqRowActionsProps {
  id: string;
  embeddingStatus: string;
  canWrite: boolean;
}

/** Aksi baris FAQ: edit (link), ulang embedding, dan hapus (soft delete). */
export function FaqRowActions({ id, embeddingStatus, canWrite }: FaqRowActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleRetry() {
    startTransition(async () => {
      const res = await retryEmbedding(id);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
      router.refresh();
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteFaq(id);
      setConfirmOpen(false);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
      router.refresh();
    });
  }

  if (!canWrite) {
    return (
      <div className="flex items-center justify-end gap-1">
        <span className="text-xs text-muted-foreground">Hanya baca</span>
      </div>
    );
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
          {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        </Button>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon-sm" title="Hapus FAQ">
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus FAQ?</AlertDialogTitle>
            <AlertDialogDescription>
              FAQ akan dihapus secara lunak dan tidak lagi muncul di daftar
              maupun hasil pencarian bot. Tindakan ini dicatat di audit log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
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
  );
}
