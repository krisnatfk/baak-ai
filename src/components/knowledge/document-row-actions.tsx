"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import {
  deleteDocument,
  retryDocumentEmbedding,
} from "@/lib/server/actions/documents";
import { generateFaqFromDocument } from "@/lib/server/actions/faq-import";
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

interface DocumentRowActionsProps {
  document: {
    id: string;
    status: string;
    fileName: string;
  };
}

/** Aksi baris dokumen: generate FAQ, retry embedding chunk gagal, hapus. */
export function DocumentRowActions({ document }: DocumentRowActionsProps) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function run(actionKey: string, fn: () => Promise<{ ok: boolean; message: string }>) {
    setPending(actionKey);
    void (async () => {
      const res = await fn();
      setPending(null);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
      router.refresh();
    })();
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={document.status === "FAILED" || pending === "generate"}
        onClick={() =>
          run("generate", () => generateFaqFromDocument(document.id))
        }
        title={
          document.status === "FAILED"
            ? "Dokumen gagal diproses — hapus lalu unggah ulang"
            : "Generate FAQ dari dokumen"
        }
      >
        {pending === "generate" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Sparkles className="size-4" />
        )}
      </Button>

      <Button
        variant="ghost"
        size="icon-sm"
        disabled={document.status === "FAILED" || pending === "retry"}
        onClick={() =>
          run("retry", () => retryDocumentEmbedding(document.id))
        }
        title={
          document.status === "FAILED"
            ? "Dokumen gagal diproses — hapus lalu unggah ulang"
            : "Proses ulang embedding yang gagal"
        }
      >
        {pending === "retry" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <RefreshCw className="size-4" />
        )}
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon-sm" title="Hapus dokumen">
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus dokumen?</AlertDialogTitle>
            <AlertDialogDescription>
              Dokumen &ldquo;{document.fileName}&rdquo; beserta seluruh bagian
              teksnya akan dihapus permanen dan tidak lagi dipakai chatbot.
              Tindakan ini dicatat di audit log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending === "delete"}>
              Batal
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={pending === "delete"}
              onClick={(e) => {
                e.preventDefault();
                run("delete", () => deleteDocument(document.id));
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {pending === "delete" && <Loader2 className="size-4 animate-spin" />}
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

