"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ImageIcon, Loader2, Paperclip, Plus, Trash2 } from "lucide-react";
import {
  faqFormSchema,
  type FaqFormInput,
  type FaqFormValues,
} from "@/lib/knowledge-schema";
import {
  createFaq,
  updateFaq,
} from "@/lib/server/actions/knowledge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { FaqAiAssistant } from "@/components/knowledge/faq-ai-assistant";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const AUDIENCE_OPTIONS: Array<{ value: FaqFormValues["audience"]; label: string }> = [
  { value: "MAHASISWA", label: "Mahasiswa" },
  { value: "CALON_MAHASISWA", label: "Calon Mahasiswa" },
  { value: "ALUMNI", label: "Alumni" },
  { value: "ORANG_TUA", label: "Orang Tua" },
  { value: "UMUM", label: "Umum" },
];

export const STATUS_OPTIONS: Array<{ value: FaqFormValues["status"]; label: string }> = [
  { value: "DRAFT", label: "Draf" },
  { value: "ACTIVE", label: "Aktif" },
  { value: "INACTIVE", label: "Nonaktif" },
  { value: "NEEDS_REVIEW", label: "Perlu Review" },
];

export const ITEM_SOURCE_TYPE_OPTIONS: Array<{
  value: FaqFormValues["sources"][number]["type"];
  label: string;
}> = [
  { value: "WEBSITE", label: "Website" },
  { value: "DOCUMENT", label: "Dokumen" },
  { value: "INTERNAL", label: "Internal" },
  { value: "OTHER", label: "Lainnya" },
];

export const MEDIA_TYPE_OPTIONS: Array<{
  value: FaqFormValues["media"][number]["type"];
  label: string;
}> = [
  { value: "IMAGE", label: "Gambar" },
  { value: "VIDEO", label: "Video" },
  { value: "OTHER", label: "Lainnya" },
];

export const ATTACHMENT_TYPE_OPTIONS: Array<{
  value: FaqFormValues["attachments"][number]["type"];
  label: string;
}> = [
  { value: "PDF", label: "PDF" },
  { value: "DOC", label: "DOC" },
  { value: "DOCX", label: "DOCX" },
  { value: "XLS", label: "XLS" },
  { value: "XLSX", label: "XLSX" },
  { value: "OTHER", label: "Lainnya" },
];

export interface CategoryOption {
  id: string;
  name: string;
}
export interface SourceOption {
  id: string;
  title: string;
  type: string;
}
export interface RelatedFaqOption {
  id: string;
  question: string;
}

interface FaqFormProps {
  mode: "create" | "edit";
  faqId?: string;
  defaultValues?: FaqFormValues;
  categories: CategoryOption[];
  sources: SourceOption[];
  /** FAQ AKTIF lain untuk dipilih sebagai "Pertanyaan Terkait" (bagian C). */
  relatedFaqs: RelatedFaqOption[];
  /** ID pertanyaan tidak terjawab yang diisi otomatis (alur "Tambahkan ke KB"). */
  unansweredId?: string;
}

const IMAGE_ACCEPT = ".jpg,.jpeg,.png,.webp,.gif";
const ATTACHMENT_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx";

/** Ambil pesan error untuk field di dalam array (errors.<nama>[i].<field>). */
function fieldArrayError(
  errors: unknown,
  key: string,
  index: number,
  field: string,
): string | undefined {
  if (!errors) return undefined;
  const arr = (errors as Record<string, unknown>)[key];
  if (!Array.isArray(arr)) return undefined;
  const item = arr[index] as Record<string, unknown> | undefined;
  const err = item?.[field] as { message?: string } | undefined;
  return err?.message;
}

export function FaqForm({
  mode,
  faqId,
  defaultValues,
  categories,
  sources,
  relatedFaqs,
  unansweredId,
}: FaqFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [keywordsText, setKeywordsText] = useState(
    (defaultValues?.keywords ?? []).join(", "),
  );

  const {
    register,
    control,
    handleSubmit,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<FaqFormInput>({
    resolver: zodResolver(faqFormSchema),
    defaultValues: defaultValues ?? {
      question: "",
      answer: "",
      categoryId: null,
      audience: "MAHASISWA",
      keywords: [],
      sourceId: null,
      sourceUrl: "",
      status: "DRAFT",
      internalNote: "",
      showInMainMenu: false,
      mainMenuOrder: null,
      alternatives: [],
      sources: [],
      relatedQuestions: [],
      media: [],
      attachments: [],
    },
  });

  const watchedQuestion = useWatch({ control, name: "question" }) ?? "";
  const watchedAnswer = useWatch({ control, name: "answer" }) ?? "";

  const { fields: alternativeFields, append: appendAlternative, remove: removeAlternative } =
    useFieldArray({ control, name: "alternatives" });
  const { fields: sourceFields, append: appendSource, remove: removeSource, move: moveSource } =
    useFieldArray({ control, name: "sources" });
  const { fields: relatedFields, append: appendRelated, remove: removeRelated } =
    useFieldArray({ control, name: "relatedQuestions" });
  const { fields: mediaFields, append: appendMedia, remove: removeMedia, move: moveMedia } =
    useFieldArray({ control, name: "media" });
  const { fields: attachmentFields, append: appendAttachment, remove: removeAttachment, move: moveAttachment } =
    useFieldArray({ control, name: "attachments" });

  // File terpilih untuk baris media/lampiran — dikunci per field.id agar tetap
  // akurat walau baris dihapus/dipindah. (Form tidak menyimpan objek File —
  // hanya flag hasFile; File dibawa terpisah via FormData saat submit.)
  const mediaFiles = useRef(new Map<string, File>());
  const attachmentFiles = useRef(new Map<string, File>());
  const [mediaFileNames, setMediaFileNames] = useState<Record<string, string>>({});
  const [attachmentFileNames, setAttachmentFileNames] = useState<Record<string, string>>({});

  const relatedFaqById = new Map(relatedFaqs.map((f) => [f.id, f.question]));

  function onKeywordsChange(raw: string) {
    setKeywordsText(raw);
    const parsed = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 30);
    setValue("keywords", parsed, { shouldValidate: false });
  }

  function handleMediaFile(
    index: number,
    fieldId: string,
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0] ?? null;
    if (file) {
      mediaFiles.current.set(fieldId, file);
      setMediaFileNames((prev) => ({ ...prev, [fieldId]: file.name }));
    } else {
      mediaFiles.current.delete(fieldId);
      setMediaFileNames((prev) => {
        const next = { ...prev };
        delete next[fieldId];
        return next;
      });
    }
    setValue(`media.${index}.hasFile` as const, !!file, { shouldValidate: true });
    e.target.value = "";
  }

  function handleAttachmentFile(
    index: number,
    fieldId: string,
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0] ?? null;
    if (file) {
      attachmentFiles.current.set(fieldId, file);
      setAttachmentFileNames((prev) => ({ ...prev, [fieldId]: file.name }));
    } else {
      attachmentFiles.current.delete(fieldId);
      setAttachmentFileNames((prev) => {
        const next = { ...prev };
        delete next[fieldId];
        return next;
      });
    }
    setValue(`attachments.${index}.hasFile` as const, !!file, { shouldValidate: true });
    e.target.value = "";
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Buang baris kosong agar tidak gagal validasi.
    setValue("alternatives", (getValues("alternatives") ?? []).filter((a) => a.question.trim().length > 0));
    setValue("sources", (getValues("sources") ?? []).filter((s) => s.title.trim().length > 0));
    setValue(
      "relatedQuestions",
      (getValues("relatedQuestions") ?? []).filter(
        (r) => r.relatedKnowledgeId != null || (r.question ?? "").trim().length > 0,
      ),
    );
    setValue(
      "media",
      (getValues("media") ?? []).filter(
        (m) => m.hasFile || m.filePath != null || (m.url ?? "").trim().length > 0,
      ),
    );
    setValue(
      "attachments",
      (getValues("attachments") ?? []).filter(
        (a) => a.hasFile || a.filePath != null || (a.url ?? "").trim().length > 0,
      ),
    );

    void handleSubmit(async (values) => {
      const formData = new FormData();
      formData.append("data", JSON.stringify(values));

      // Tempelkan File upload pada baris media/lampiran (urutan = indeks saat ini).
      (values.media ?? []).forEach((m, i) => {
        const file = mediaFiles.current.get(mediaFields[i]?.id ?? "");
        if (file) formData.append(`media_${i}`, file);
      });
      (values.attachments ?? []).forEach((a, i) => {
        const file = attachmentFiles.current.get(attachmentFields[i]?.id ?? "");
        if (file) formData.append(`attachment_${i}`, file);
      });

      startTransition(async () => {
        const res =
          mode === "create"
            ? await createFaq(formData, unansweredId)
            : await updateFaq(faqId!, formData);
        if (res.ok) {
          toast.success(res.message);
          router.push("/knowledge/faq");
          router.refresh();
        } else {
          toast.error(res.message);
        }
      });
    })(e);
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="flex flex-col gap-4">
        {/* A — Informasi utama */}
        <Card>
          <CardContent className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="question">Pertanyaan</Label>
              <Textarea
                id="question"
                rows={2}
                placeholder="Contoh: Bagaimana cara cetak ulang KHS?"
                aria-invalid={!!errors.question}
                {...register("question")}
              />
              {errors.question && (
                <p className="text-sm text-destructive">{errors.question.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="answer">Jawaban</Label>
              <Textarea
                id="answer"
                rows={10}
                placeholder="Tulis jawaban lengkap yang akan dipakai bot..."
                aria-invalid={!!errors.answer}
                {...register("answer")}
              />
              {errors.answer && (
                <p className="text-sm text-destructive">{errors.answer.message}</p>
              )}
            </div>

            <FaqAiAssistant
              faqId={faqId}
              question={watchedQuestion}
              answer={watchedAnswer}
              onUseAnswer={(value) =>
                setValue("answer", value, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              onUseVariations={(values) => {
                const existing = getValues("alternatives") ?? [];
                const seen = new Set(
                  existing.map((item) => item.question.toLowerCase()),
                );
                setValue(
                  "alternatives",
                  [
                    ...existing,
                    ...values
                      .filter((value) => !seen.has(value.toLowerCase()))
                      .map((question) => ({ question })),
                  ].slice(0, 20),
                  { shouldDirty: true },
                );
              }}
              onUseKeywords={(values) => {
                setKeywordsText(values.join(", "));
                setValue("keywords", values, { shouldDirty: true });
              }}
              onUseRelated={(values) => {
                const existing = getValues("relatedQuestions") ?? [];
                const seen = new Set(
                  existing.map((item) => item.relatedKnowledgeId),
                );
                setValue(
                  "relatedQuestions",
                  [
                    ...existing,
                    ...values
                      .filter((value) => !seen.has(value.faqId))
                      .map((value) => ({
                        relatedKnowledgeId: value.faqId,
                        question: value.question,
                      })),
                  ].slice(0, 20),
                  { shouldDirty: true },
                );
              }}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="categoryId">Kategori</Label>
                <Controller
                  control={control}
                  name="categoryId"
                  render={({ field }) => (
                    <Select
                      value={field.value ?? "none"}
                      onValueChange={(v) =>
                        field.onChange(v === "none" ? null : v)
                      }
                    >
                      <SelectTrigger id="categoryId">
                        <SelectValue placeholder="Tanpa kategori" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Tanpa kategori</SelectItem>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="audience">Audiens</Label>
                <Controller
                  control={control}
                  name="audience"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(v) =>
                        field.onChange(v as FaqFormValues["audience"])
                      }
                    >
                      <SelectTrigger id="audience">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AUDIENCE_OPTIONS.map((o) => (
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
                <Label htmlFor="sourceId">Sumber</Label>
                <Controller
                  control={control}
                  name="sourceId"
                  render={({ field }) => (
                    <Select
                      value={field.value ?? "none"}
                      onValueChange={(v) =>
                        field.onChange(v === "none" ? null : v)
                      }
                    >
                      <SelectTrigger id="sourceId">
                        <SelectValue placeholder="Tanpa sumber" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Tanpa sumber</SelectItem>
                        {sources.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Controller
                  control={control}
                  name="status"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(v) =>
                        field.onChange(v as FaqFormValues["status"])
                      }
                    >
                      <SelectTrigger id="status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 rounded-md border p-4 bg-muted/50">
              <div className="flex flex-row items-start space-x-3 space-y-0 p-2">
                <Controller
                  control={control}
                  name="showInMainMenu"
                  render={({ field }) => (
                    <Checkbox
                      id="showInMainMenu"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
                <div className="space-y-1 leading-none">
                  <Label htmlFor="showInMainMenu" className="font-medium cursor-pointer">
                    Tampilkan di Menu Utama
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Ceklis agar FAQ ini muncul di menu awal chatbot (hanya efektif jika kategori PMB).
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mainMenuOrder">Urutan Menu</Label>
                <Controller
                  control={control}
                  name="mainMenuOrder"
                  render={({ field }) => (
                    <Input
                      id="mainMenuOrder"
                      type="number"
                      placeholder="Contoh: 1, 2, 3..."
                      value={field.value ?? ""}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        field.onChange(isNaN(val) ? null : val);
                      }}
                    />
                  )}
                />
                {errors.mainMenuOrder && (
                  <p className="text-sm text-destructive">{errors.mainMenuOrder.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="keywords">Kata kunci</Label>
              <Input
                id="keywords"
                value={keywordsText}
                onChange={(e) => onKeywordsChange(e.target.value)}
                placeholder="pisahkan dengan koma, mis. KHS, cetak ulang, transkrip"
              />
              <p className="text-xs text-muted-foreground">
                Maksimal 30 kata kunci — dipakai untuk meningkatkan kecocokan pencarian.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sourceUrl">URL rujukan</Label>
              <Input
                id="sourceUrl"
                type="url"
                placeholder="https://spmb.teknokrat.ac.id/... (opsional)"
                aria-invalid={!!errors.sourceUrl}
                {...register("sourceUrl")}
              />
              {errors.sourceUrl && (
                <p className="text-sm text-destructive">{errors.sourceUrl.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* B — Sumber Resmi */}
        <Card>
          <CardContent className="space-y-4 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">B. Sumber Resmi</h2>
                <p className="text-xs text-muted-foreground">
                  Rujukan resmi khusus FAQ ini — muncul pada jawaban bot (maks. 20).
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={sourceFields.length >= 20}
                onClick={() => appendSource({ title: "", type: "WEBSITE", url: "" })}
              >
                <Plus className="size-4" /> Tambah Sumber
              </Button>
            </div>

            {sourceFields.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Belum ada sumber resmi.
              </p>
            )}

            <div className="space-y-3">
              {sourceFields.map((field, index) => (
                <div
                  key={field.id}
                  className="space-y-2 rounded-md border p-3"
                >
                  <div className="flex items-start gap-2">
                    <div className="grid flex-1 gap-2 sm:grid-cols-[1fr_200px]">
                      <div className="space-y-1">
                        <Input
                          placeholder={`Judul sumber ${index + 1}`}
                          aria-invalid={!!fieldArrayError(errors, "sources", index, "title")}
                          {...register(`sources.${index}.title` as const)}
                        />
                        {fieldArrayError(errors, "sources", index, "title") && (
                          <p className="text-sm text-destructive">
                            {fieldArrayError(errors, "sources", index, "title")}
                          </p>
                        )}
                      </div>
                      <Controller
                        control={control}
                        name={`sources.${index}.type`}
                        render={({ field: typeField }) => (
                          <Select
                            value={typeField.value}
                            onValueChange={(v) => typeField.onChange(v)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ITEM_SOURCE_TYPE_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                  {o.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>
                    <div className="flex shrink-0">
                      <Button type="button" variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => moveSource(index, index - 1)} aria-label="Naikkan sumber">
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon-sm" disabled={index === sourceFields.length - 1} onClick={() => moveSource(index, index + 1)} aria-label="Turunkan sumber">
                        <ArrowDown className="size-4" />
                      </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0"
                      onClick={() => removeSource(index)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                    </div>
                  </div>
                  <Input
                    type="url"
                    placeholder="https://... (opsional)"
                    aria-invalid={!!fieldArrayError(errors, "sources", index, "url")}
                    {...register(`sources.${index}.url` as const)}
                  />
                  {fieldArrayError(errors, "sources", index, "url") && (
                    <p className="text-sm text-destructive">
                      {fieldArrayError(errors, "sources", index, "url")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* C — Pertanyaan Terkait */}
        <Card>
          <CardContent className="space-y-4 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">C. Pertanyaan Terkait</h2>
                <p className="text-xs text-muted-foreground">
                  Disarankan ke user sebagai lanjutan — pilih dari FAQ lain atau
                  tulis pertanyaan yang sudah divalidasi (bukan dibuat LLM).
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={relatedFields.length >= 20}
                onClick={() => appendRelated({ relatedKnowledgeId: null, question: "" })}
              >
                <Plus className="size-4" /> Tambah
              </Button>
            </div>

            {relatedFields.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Belum ada pertanyaan terkait.
              </p>
            )}

            <div className="space-y-3">
              {relatedFields.map((field, index) => (
                <div
                  key={field.id}
                  className="space-y-2 rounded-md border p-3"
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 space-y-2">
                      <Controller
                        control={control}
                        name={`relatedQuestions.${index}.relatedKnowledgeId`}
                        render={({ field: relField }) => (
                          <Select
                            value={relField.value ?? "none"}
                            onValueChange={(v) => {
                              relField.onChange(v === "none" ? null : v);
                              if (v !== "none") {
                                const q = relatedFaqById.get(v);
                                if (q) {
                                  setValue(`relatedQuestions.${index}.question` as const, q);
                                }
                              }
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Pilih FAQ aktif (opsional)" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Tanpa FAQ terkait</SelectItem>
                              {relatedFaqs.map((f) => (
                                <SelectItem key={f.id} value={f.id}>
                                  {f.question}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      <Input
                        placeholder="Tulis pertanyaan terkait (opsional bila FAQ dipilih)"
                        aria-invalid={!!fieldArrayError(errors, "relatedQuestions", index, "question")}
                        {...register(`relatedQuestions.${index}.question` as const)}
                      />
                      {fieldArrayError(errors, "relatedQuestions", index, "question") && (
                        <p className="text-sm text-destructive">
                          {fieldArrayError(errors, "relatedQuestions", index, "question")}
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0"
                      onClick={() => removeRelated(index)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* D — Media */}
        <Card>
          <CardContent className="space-y-4 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">D. Media</h2>
                <p className="text-xs text-muted-foreground">
                  Gambar/video pendukung jawaban — unggah file atau tempel URL
                  eksternal (maks. 20).
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={mediaFields.length >= 20}
                onClick={() =>
                  appendMedia({ type: "IMAGE", caption: "", url: "", hasFile: false })
                }
              >
                <ImageIcon className="size-4" /> Tambah Gambar
              </Button>
            </div>

            {mediaFields.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Belum ada media.
              </p>
            )}

            <div className="space-y-3">
              {mediaFields.map((field, index) => {
                const row = getValues(`media.${index}`) ?? { hasFile: false, fileName: null };
                const hasFile = !!row.hasFile;
                return (
                  <div
                    key={field.id}
                    className="space-y-2 rounded-md border p-3"
                  >
                    <div className="flex items-start gap-2">
                      <div className="grid flex-1 gap-2 sm:grid-cols-[200px_1fr]">
                        <Controller
                          control={control}
                          name={`media.${index}.type`}
                          render={({ field: typeField }) => (
                            <Select
                              value={typeField.value}
                              onValueChange={(v) => typeField.onChange(v)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {MEDIA_TYPE_OPTIONS.map((o) => (
                                  <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                        <Input
                          placeholder="URL media eksternal (opsional)"
                          aria-invalid={!!fieldArrayError(errors, "media", index, "url")}
                          {...register(`media.${index}.url` as const)}
                        />
                      </div>
                      <div className="flex shrink-0">
                        <Button type="button" variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => moveMedia(index, index - 1)} aria-label="Naikkan media">
                          <ArrowUp className="size-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon-sm" disabled={index === mediaFields.length - 1} onClick={() => moveMedia(index, index + 1)} aria-label="Turunkan media">
                          <ArrowDown className="size-4" />
                        </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0"
                        onClick={() => removeMedia(index)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                      </div>
                    </div>

                    {row.type === "IMAGE" && (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          id={`media-file-${field.id}`}
                          type="file"
                          accept={IMAGE_ACCEPT}
                          className="hidden"
                          onChange={(e) => handleMediaFile(index, field.id, e)}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            document.getElementById(`media-file-${field.id}`)?.click()
                          }
                        >
                          {hasFile ? "Ganti gambar" : "Pilih gambar"}
                        </Button>
                        <span className="truncate text-xs text-muted-foreground">
                          {mediaFileNames[field.id] ??
                            (row.fileName ? `Gambar saat ini: ${row.fileName}` : "JPG/PNG/WEBP/GIF · maks. 15 MB")}
                        </span>
                      </div>
                    )}

                    <Input
                      placeholder="Keterangan gambar (opsional)"
                      {...register(`media.${index}.caption` as const)}
                    />
                    {fieldArrayError(errors, "media", index, "url") && (
                      <p className="text-sm text-destructive">
                        {fieldArrayError(errors, "media", index, "url")}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* E — Lampiran */}
        <Card>
          <CardContent className="space-y-4 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">E. Lampiran</h2>
                <p className="text-xs text-muted-foreground">
                  File PDF/DOC/DOCX/XLS/XLSX yang dikirimkan ke user oleh bot
                  (maks. 20).
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={attachmentFields.length >= 20}
                onClick={() =>
                  appendAttachment({ title: "", type: "PDF", url: "", hasFile: false })
                }
              >
                <Paperclip className="size-4" /> Tambah Lampiran
              </Button>
            </div>

            {attachmentFields.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Belum ada lampiran.
              </p>
            )}

            <div className="space-y-3">
              {attachmentFields.map((field, index) => {
                const row = getValues(`attachments.${index}`) ?? { hasFile: false, fileName: null };
                const hasFile = !!row.hasFile;
                return (
                  <div
                    key={field.id}
                    className="space-y-2 rounded-md border p-3"
                  >
                    <div className="flex items-start gap-2">
                      <div className="grid flex-1 gap-2 sm:grid-cols-2">
                        <Input
                          placeholder={`Judul lampiran ${index + 1}`}
                          aria-invalid={!!fieldArrayError(errors, "attachments", index, "title")}
                          {...register(`attachments.${index}.title` as const)}
                        />
                        <Controller
                          control={control}
                          name={`attachments.${index}.type`}
                          render={({ field: typeField }) => (
                            <Select
                              value={typeField.value}
                              onValueChange={(v) => typeField.onChange(v)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ATTACHMENT_TYPE_OPTIONS.map((o) => (
                                  <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>
                      <div className="flex shrink-0">
                        <Button type="button" variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => moveAttachment(index, index - 1)} aria-label="Naikkan lampiran">
                          <ArrowUp className="size-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon-sm" disabled={index === attachmentFields.length - 1} onClick={() => moveAttachment(index, index + 1)} aria-label="Turunkan lampiran">
                          <ArrowDown className="size-4" />
                        </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0"
                        onClick={() => removeAttachment(index)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        id={`attachment-file-${field.id}`}
                        type="file"
                        accept={ATTACHMENT_ACCEPT}
                        className="hidden"
                        onChange={(e) => handleAttachmentFile(index, field.id, e)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          document.getElementById(`attachment-file-${field.id}`)?.click()
                        }
                      >
                        {hasFile ? "Ganti file" : "Pilih file"}
                      </Button>
                      <span className="truncate text-xs text-muted-foreground">
                        {attachmentFileNames[field.id] ??
                          (row.fileName ? `File saat ini: ${row.fileName}` : "PDF/DOC/DOCX/XLS/XLSX · maks. 15 MB")}
                      </span>
                    </div>

                    <Input
                      type="url"
                      placeholder="URL file eksternal (opsional)"
                      aria-invalid={!!fieldArrayError(errors, "attachments", index, "url")}
                      {...register(`attachments.${index}.url` as const)}
                    />

                    {fieldArrayError(errors, "attachments", index, "title") && (
                      <p className="text-sm text-destructive">
                        {fieldArrayError(errors, "attachments", index, "title")}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Pertanyaan Alternatif */}
        <Card>
          <CardContent className="space-y-4 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">Pertanyaan Alternatif</h2>
                <p className="text-xs text-muted-foreground">
                  Cara lain user menanyakan hal yang sama (maksimal 20).
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={alternativeFields.length >= 20}
                onClick={() => appendAlternative({ question: "" })}
              >
                <Plus className="size-4" /> Tambah
              </Button>
            </div>

            {alternativeFields.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Belum ada pertanyaan alternatif.
              </p>
            )}

            <div className="space-y-2">
              {alternativeFields.map((field, index) => (
                <div key={field.id} className="flex items-start gap-2">
                  <div className="flex-1 space-y-1">
                    <Input
                      placeholder={`Alternatif ${index + 1}`}
                      aria-invalid={!!fieldArrayError(errors, "alternatives", index, "question")}
                      {...register(`alternatives.${index}.question` as const)}
                    />
                    {fieldArrayError(errors, "alternatives", index, "question") && (
                      <p className="text-sm text-destructive">
                        {fieldArrayError(errors, "alternatives", index, "question")}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0"
                    onClick={() => removeAlternative(index)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Catatan internal */}
        <Card>
          <CardContent className="space-y-2 pt-4">
            <Label htmlFor="internalNote">Catatan internal</Label>
            <Textarea
              id="internalNote"
              rows={3}
              placeholder="Catatan untuk tim (tidak ditampilkan ke bot/user)..."
              {...register("internalNote")}
            />
            {errors.internalNote && (
              <p className="text-sm text-destructive">{errors.internalNote.message}</p>
            )}
          </CardContent>
          <CardFooter className="justify-end gap-2 border-t px-4 py-3">
            <Button type="button" variant="outline" asChild disabled={pending}>
              <Link href="/knowledge/faq">Batal</Link>
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {mode === "create" ? "Simpan FAQ" : "Simpan Perubahan"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </form>
  );
}
