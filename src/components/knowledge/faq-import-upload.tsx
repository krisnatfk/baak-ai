"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp, Loader2 } from "lucide-react";
import { previewFaqImport } from "@/lib/server/actions/faq-import";
import { Button } from "@/components/ui/button";

const ACCEPTED = ".xlsx,.csv";

/** Unggah file import FAQ → parse → validasi → preview (redirect ke batch). */
export function FaqImportUpload() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function onSubmit() {
    if (!file) {
      toast.error("Pilih file XLSX atau CSV terlebih dahulu.");
      return;
    }
    const formData = new FormData();
    formData.append("file", file);

    startTransition(async () => {
      const res = await previewFaqImport(formData);
      if (res.ok && "batchId" in res) {
        toast.success("File berhasil di-parse. Menampilkan preview…");
        router.push(`/knowledge/faq/import/${res.batchId}`);
      } else {
        toast.error(res.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-6">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed px-6 py-10 text-center transition-colors hover:bg-muted/50"
      >
        <FileUp className="size-8 text-muted-foreground" />
        {file ? (
          <span className="text-sm font-medium">{file.name}</span>
        ) : (
          <span className="text-sm text-muted-foreground">
            Klik untuk memilih file — XLSX atau CSV
          </span>
        )}
      </button>
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => {
            setFile(null);
            if (inputRef.current) inputRef.current.value = "";
          }}
        >
          Batal
        </Button>
        <Button type="button" disabled={pending || !file} onClick={onSubmit}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Parse &amp; Preview
        </Button>
      </div>
    </div>
  );
}
