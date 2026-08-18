"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp, Loader2 } from "lucide-react";
import { uploadDocumentSchema } from "@/lib/documents-schema";
import { uploadDocument } from "@/lib/server/actions/documents";
import { formatBytes } from "@/lib/format";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface DocumentSourceOption {
  id: string;
  title: string;
}

interface DocumentUploadProps {
  sources: DocumentSourceOption[];
  trigger: React.ReactNode;
}

const ACCEPTED_TYPES = [".pdf", ".docx", ".txt"];
const MAX_DISPLAY_MB = 15;

/** Dialog unggah dokumen ke knowledge base — dipakai dari halaman Dokumen. */
export function DocumentUpload({ sources, trigger }: DocumentUploadProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [sourceId, setSourceId] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(next: File | null) {
    setSelectedFile(next);
    setFileError(null);
  }

  function pickFile() {
    fileInputRef.current?.click();
  }

  function onSubmit() {
    if (!selectedFile) {
      setFileError("Pilih file PDF, DOCX, atau TXT terlebih dahulu.");
      return;
    }
    const parsed = uploadDocumentSchema.safeParse({
      sourceId,
      file: selectedFile,
    });
    if (!parsed.success) {
      setFileError(parsed.error.issues[0]?.message ?? "File tidak valid.");
      return;
    }

    const formData = new FormData();
    formData.append("file", parsed.data.file);

    startTransition(async () => {
      const res = await uploadDocument(parsed.data.sourceId, formData);
      if (res.ok) {
        toast.success(res.message);
        setOpen(false);
        setSelectedFile(null);
        setSourceId("");
        if (fileInputRef.current) fileInputRef.current.value = "";
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setSelectedFile(null);
          setFileError(null);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Unggah Dokumen</DialogTitle>
          <DialogDescription>
            Teks dokumen diekstrak, dipotong menjadi bagian, lalu di-embed agar
            bisa dicari chatbot. Mendukung PDF, DOCX, dan TXT (maks.{" "}
            {MAX_DISPLAY_MB} MB).
          </DialogDescription>
        </DialogHeader>

        <form
          action={onSubmit}
          noValidate
          className="space-y-4"
        >
          {/* File (disembunyikan — dikontrol lewat area klik) */}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            className="hidden"
            onChange={(e) =>
              handleFileChange(e.target.files?.[0] ?? null)
            }
          />

          <div className="space-y-2">
            <Label htmlFor="document-source">Sumber (opsional)</Label>
            <Select value={sourceId} onValueChange={setSourceId}>
              <SelectTrigger id="document-source">
                <SelectValue placeholder="Tanpa sumber" />
              </SelectTrigger>
              <SelectContent>
                {sources.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>File</Label>
            <button
              type="button"
              onClick={pickFile}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-8 text-center transition-colors hover:bg-muted/50"
              aria-label="Pilih file dokumen"
            >
              <FileUp className="size-6 text-muted-foreground" />
              {selectedFile ? (
                <span className="text-sm font-medium">
                  {selectedFile.name}
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({formatBytes(selectedFile.size)})
                  </span>
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">
                  Klik untuk memilih file — PDF, DOCX, atau TXT
                </span>
              )}
            </button>
            {fileError && (
              <p className="text-sm text-destructive">{fileError}</p>
            )}
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
              Unggah &amp; Proses
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
