"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Undo2 } from "lucide-react";
import { rollbackImport } from "@/lib/server/actions/faq-import";
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

/** Tombol rollback batch import (dengan konfirmasi). */
export function FaqImportRollback({ batchId }: { batchId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function handleRollback() {
    startTransition(async () => {
      const res = await rollbackImport(batchId);
      setOpen(false);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
      router.refresh();
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" disabled={pending}>
          <Undo2 className="size-4" /> Rollback Import
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Rollback batch ini?</AlertDialogTitle>
          <AlertDialogDescription>
            FAQ hasil batch ini yang masih berstatus Draft / Perlu Review akan
            dihapus (soft delete). FAQ yang sudah di-Publish/Archive akan
            dipertahankan. Tindakan ini tidak bisa dibatalkan.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              handleRollback();
            }}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Ya, Rollback
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
