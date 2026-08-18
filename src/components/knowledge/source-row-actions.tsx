"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import {
  deleteSource,
  setSourceActive,
} from "@/lib/server/actions/knowledge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
import { SourceDialog, type SourceDialogRow } from "@/components/knowledge/source-dialog";

interface SourceRowActionsProps {
  source: SourceDialogRow;
}

/** Aksi baris sumber: aktif/nonaktif, edit, dan hapus. */
export function SourceRowActions({ source }: SourceRowActionsProps) {
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
    <div className="flex items-center justify-end gap-2">
      <Switch
        checked={source.isActive}
        disabled={pending === "active"}
        onCheckedChange={(checked) =>
          run("active", () => setSourceActive(source.id, checked))
        }
        aria-label={source.isActive ? "Nonaktifkan sumber" : "Aktifkan sumber"}
      />

      <SourceDialog
        mode="edit"
        source={source}
        trigger={
          <Button variant="ghost" size="icon-sm" title="Edit sumber">
            <Pencil className="size-4" />
          </Button>
        }
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon-sm" title="Hapus sumber">
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus sumber?</AlertDialogTitle>
            <AlertDialogDescription>
              Sumber akan dihapus permanen. Sumber yang masih dipakai FAQ tidak
              dapat dihapus — nonaktifkan saja. Tindakan ini dicatat di audit
              log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending === "delete"}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending === "delete"}
              onClick={(e) => {
                e.preventDefault();
                run("delete", () => deleteSource(source.id));
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
