"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import {
  deleteCategory,
  setCategoryActive,
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
import {
  CategoryDialog,
  type CategoryDialogRow,
} from "@/components/knowledge/category-dialog";

interface CategoryRowActionsProps {
  category: CategoryDialogRow;
}

/** Aksi baris kategori: aktif/nonaktif, edit, dan hapus. */
export function CategoryRowActions({ category }: CategoryRowActionsProps) {
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
        checked={category.isActive}
        disabled={pending === "active"}
        onCheckedChange={(checked) =>
          run("active", () => setCategoryActive(category.id, checked))
        }
        aria-label={category.isActive ? "Nonaktifkan kategori" : "Aktifkan kategori"}
      />

      <CategoryDialog
        mode="edit"
        category={category}
        trigger={
          <Button variant="ghost" size="icon-sm" title="Edit kategori">
            <Pencil className="size-4" />
          </Button>
        }
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon-sm" title="Hapus kategori">
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus kategori?</AlertDialogTitle>
            <AlertDialogDescription>
              Kategori akan dihapus permanen. Kategori yang masih dipakai FAQ
              tidak dapat dihapus — nonaktifkan saja. Tindakan ini dicatat di
              audit log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending === "delete"}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending === "delete"}
              onClick={(e) => {
                e.preventDefault();
                run("delete", () => deleteCategory(category.id));
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
