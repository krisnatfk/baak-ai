/**
 * Schema validasi untuk operasi dokumen (upload).
 * Dipakai server action dan dialog client (zodResolver).
 */

import { z } from "zod";

export const uploadDocumentSchema = z.object({
  /** Sumber knowledge opsional — kosong berarti "tanpa sumber". */
  sourceId: z
    .union([z.string().uuid("Sumber tidak valid."), z.literal("")])
    .default(""),
  file: z.custom<File>(
    (value) => typeof File !== "undefined" && value instanceof File,
    "File tidak valid.",
  ),
});

export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;
