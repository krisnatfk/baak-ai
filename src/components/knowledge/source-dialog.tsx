"use client";

import { useState, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  sourceSchema,
  type SourceFormInput,
  type SourceFormValues,
} from "@/lib/knowledge-schema";
import { createSource, updateSource } from "@/lib/server/actions/knowledge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface SourceDialogRow {
  id: string;
  title: string;
  type: string;
  url: string | null;
  description: string | null;
  isActive: boolean;
}

const SOURCE_TYPE_OPTIONS = [
  { value: "MANUAL", label: "Manual" },
  { value: "URL", label: "URL" },
  { value: "PDF", label: "PDF" },
  { value: "DOCX", label: "DOCX" },
  { value: "TXT", label: "TXT" },
] as const;

interface SourceDialogProps {
  mode: "create" | "edit";
  source?: SourceDialogRow;
  trigger: React.ReactNode;
}

/** Dialog buat/edit sumber pengetahuan — dipakai dari halaman Sumber. */
export function SourceDialog({ mode, source, trigger }: SourceDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SourceFormInput>({
    resolver: zodResolver(sourceSchema),
    defaultValues: source
      ? {
          title: source.title,
          type: source.type as SourceFormValues["type"],
          url: source.url ?? "",
          description: source.description ?? "",
          isActive: source.isActive,
        }
      : {
          title: "",
          type: "MANUAL",
          url: "",
          description: "",
          isActive: true,
        },
  });

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next && source) {
      reset({
        title: source.title,
        type: source.type as SourceFormValues["type"],
        url: source.url ?? "",
        description: source.description ?? "",
        isActive: source.isActive,
      });
    }
  }

  function onSubmit(values: SourceFormInput) {
    startTransition(async () => {
      const res =
        mode === "create"
          ? await createSource(values)
          : await updateSource(source!.id, values);
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
            {mode === "create" ? "Tambah Sumber" : "Edit Sumber"}
          </DialogTitle>
          <DialogDescription>
            Sumber merekam asal informasi FAQ (manual, URL, atau dokumen).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="source-title">Judul</Label>
            <Input
              id="source-title"
              placeholder="Contoh: Peraturan Akademik 2024"
              aria-invalid={!!errors.title}
              {...register("title")}
            />
            {errors.title && (
              <p className="text-sm text-destructive">{errors.title.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="source-type">Jenis</Label>
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(v) =>
                    field.onChange(v as SourceFormValues["type"])
                  }
                >
                  <SelectTrigger id="source-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCE_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="source-url">URL (opsional)</Label>
            <Input
              id="source-url"
              type="url"
              placeholder="https://baak.example.ac.id/... "
              aria-invalid={!!errors.url}
              {...register("url")}
            />
            {errors.url && (
              <p className="text-sm text-destructive">{errors.url.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="source-description">Deskripsi (opsional)</Label>
            <Textarea
              id="source-description"
              rows={3}
              placeholder="Keterangan singkat sumber..."
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
              <Label htmlFor="source-active">Aktif</Label>
              <p className="text-xs text-muted-foreground">
                Sumber nonaktif tidak disarankan pada FAQ baru.
              </p>
            </div>
            <Controller
              control={control}
              name="isActive"
              render={({ field }) => (
                <Switch
                  id="source-active"
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
              {mode === "create" ? "Simpan Sumber" : "Simpan Perubahan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
