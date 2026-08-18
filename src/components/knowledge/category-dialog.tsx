"use client";

import { useState, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  categorySchema,
  type CategoryFormInput,
} from "@/lib/knowledge-schema";
import {
  createCategory,
  updateCategory,
} from "@/lib/server/actions/knowledge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export interface CategoryDialogRow {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  isActive: boolean;
  showInBotMenu: boolean;
}

interface CategoryDialogProps {
  mode: "create" | "edit";
  category?: CategoryDialogRow;
  trigger: React.ReactNode;
}

/** Dialog buat/edit kategori — dipakai dari halaman Kategori. */
export function CategoryDialog({ mode, category, trigger }: CategoryDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CategoryFormInput>({
    resolver: zodResolver(categorySchema),
    defaultValues: category
      ? {
          name: category.name,
          description: category.description ?? "",
          color: category.color ?? "",
          isActive: category.isActive,
          showInBotMenu: category.showInBotMenu,
        }
      : {
          name: "",
          description: "",
          color: "",
          isActive: true,
          showInBotMenu: false,
        },
  });

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next && category) {
      reset({
        name: category.name,
        description: category.description ?? "",
        color: category.color ?? "",
        isActive: category.isActive,
        showInBotMenu: category.showInBotMenu,
      });
    }
  }

  function onSubmit(values: CategoryFormInput) {
    startTransition(async () => {
      const res =
        mode === "create"
          ? await createCategory(values)
          : await updateCategory(category!.id, values);
      if (res.ok) {
        toast.success(res.message);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Tambah Kategori" : "Edit Kategori"}
          </DialogTitle>
          <DialogDescription>
            Kategori mengelompokkan FAQ dan dokumen di knowledge base.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="category-name">Nama</Label>
            <Input
              id="category-name"
              placeholder="Contoh: Registrasi"
              aria-invalid={!!errors.name}
              {...register("name")}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="category-color">Warna (opsional)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="category-color"
                placeholder="#4f46e5"
                className="font-mono"
                aria-invalid={!!errors.color}
                {...register("color")}
              />
              <div className="flex items-center gap-2">
                <Controller
                  control={control}
                  name="color"
                  render={({ field }) => (
                    <input
                      type="color"
                      className="size-8 cursor-pointer rounded-md border bg-transparent"
                      value={
                        /^#[0-9a-fA-F]{6}$/.test(field.value ?? "")
                          ? field.value
                          : "#4f46e5"
                      }
                      onChange={(e) => field.onChange(e.target.value)}
                    />
                  )}
                />
              </div>
            </div>
            {errors.color && (
              <p className="text-sm text-destructive">{errors.color.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="category-description">Deskripsi (opsional)</Label>
            <Textarea
              id="category-description"
              rows={3}
              placeholder="Deskripsi singkat kategori..."
              {...register("description")}
            />
            {errors.description && (
              <p className="text-sm text-destructive">
                {errors.description.message}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div className="space-y-0.5">
              <Label htmlFor="category-active">Aktif</Label>
              <p className="text-xs text-muted-foreground">
                Kategori nonaktif tidak disarankan pada FAQ baru.
              </p>
            </div>
            <Controller
              control={control}
              name="isActive"
              render={({ field }) => (
                <Switch
                  id="category-active"
                  checked={field.value ?? false}
                  onCheckedChange={field.onChange}
                />
              )}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div className="space-y-0.5">
              <Label htmlFor="category-bot-menu">Tampil di menu bot</Label>
              <p className="text-xs text-muted-foreground">
                Kategori ini muncul di menu bot WhatsApp (GET /api/bot/menu).
                Hanya kategori aktif yang tampil.
              </p>
            </div>
            <Controller
              control={control}
              name="showInBotMenu"
              render={({ field }) => (
                <Switch
                  id="category-bot-menu"
                  checked={field.value ?? false}
                  onCheckedChange={field.onChange}
                />
              )}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {mode === "create" ? "Simpan Kategori" : "Simpan Perubahan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
