"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BookOpen,
  CheckCircle2,
  Eye,
  Loader2,
  RotateCcw,
  XCircle,
} from "lucide-react";
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
import { setUnansweredStatus } from "@/lib/server/actions/unanswered";

interface UnansweredRowActionsProps {
  id: string;
  status: string;
  knowledgeId: string | null;
  canWrite: boolean;
}

/** Aksi baris pertanyaan tidak terjawab: alur "ke Knowledge Base" + perubahan status. */
export function UnansweredRowActions({
  id,
  status,
  knowledgeId,
  canWrite,
}: UnansweredRowActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleStatus(next: "NEW" | "REVIEWED" | "ANSWERED" | "IGNORED") {
    startTransition(async () => {
      const res = await setUnansweredStatus(id, next);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
      router.refresh();
    });
  }

  function handleIgnore() {
    setConfirmOpen(false);
    handleStatus("IGNORED");
  }

  if (!canWrite) {
    return (
      <div className="flex items-center justify-end gap-1">
        <span className="text-xs text-muted-foreground">Hanya baca</span>
      </div>
    );
  }

  const canFill =
    status === "NEW" || status === "REVIEWED";

  return (
    <div className="flex items-center justify-end gap-1">
      {canFill && (
        <Button
          variant="ghost"
          size="icon-sm"
          title="Tambahkan ke Knowledge Base (isi otomatis)"
          asChild
        >
          <Link href={`/knowledge/faq/new?unanswered=${id}`}>
            <BookOpen className="size-4" />
          </Link>
        </Button>
      )}

      {status === "ADDED_TO_KNOWLEDGE" && knowledgeId && (
        <Button
          variant="ghost"
          size="icon-sm"
          title="Lihat FAQ terkait"
          asChild
        >
          <Link href={`/knowledge/faq/${knowledgeId}/edit`}>
            <Eye className="size-4" />
          </Link>
        </Button>
      )}

      {status === "NEW" && (
        <Button
          variant="ghost"
          size="icon-sm"
          title="Tandai sudah ditinjau"
          disabled={pending}
          onClick={() => handleStatus("REVIEWED")}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Eye className="size-4" />
          )}
        </Button>
      )}

      {status === "REVIEWED" && (
        <Button
          variant="ghost"
          size="icon-sm"
          title="Tandai sudah dijawab di kanal lain"
          disabled={pending}
          onClick={() => handleStatus("ANSWERED")}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CheckCircle2 className="size-4" />
          )}
        </Button>
      )}

      {(status === "NEW" || status === "REVIEWED") && (
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              title="Abaikan pertanyaan ini"
            >
              <XCircle className="size-4 text-destructive" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Abaikan pertanyaan?</AlertDialogTitle>
              <AlertDialogDescription>
                Pertanyaan akan ditandai &ldquo;Diabaikan&rdquo; dan tidak lagi
                muncul di daftar antrean. Tindakan ini dicatat di audit log.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
              <AlertDialogAction
                disabled={pending}
                onClick={(e) => {
                  e.preventDefault();
                  handleIgnore();
                }}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                {pending && <Loader2 className="size-4 animate-spin" />}
                Abaikan
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {(status === "ANSWERED" || status === "IGNORED") && (
        <Button
          variant="ghost"
          size="icon-sm"
          title="Buka kembali (status Baru)"
          disabled={pending}
          onClick={() => handleStatus("NEW")}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RotateCcw className="size-4" />
          )}
        </Button>
      )}
    </div>
  );
}
