/**
 * Generate FAQ kandidat dari dokumen via LLM — server-only.
 *
 * Aturan anti-halusinasi (sesuai spesifikasi §J): isi chunk adalah SATU-SATUNYA
 * sumber fakta. Model dilarang mengarang biaya/deadline/tanggal/SKS/nama/link/
 * telepon/syarat/prosedur/kebijakan/lokasi yang tidak tercantum. Bila info
 * tidak cukup, chunk tersebut TIDAK menghasilkan FAQ apa pun.
 *
 * Setiap kandidat hanya membawa question/answer/alternative/keywords/category —
 * provenance (document_id/page/chunk) dilampirkan oleh pemanggil (server action)
 * saat menyimpannya sebagai DRAFT + NEEDS_REVIEW.
 */

import { chatCompletionJson, LlmError } from "@/services/llm/client";

export interface GeneratedCandidateFaq {
  question: string;
  answer: string;
  alternativeQuestions: string[];
  keywords: string[];
  /** Kategori yang disarankan (nama; boleh kosong). */
  category: string;
  /** Audiens yang disarankan (enum; boleh kosong → default MAHASISWA). */
  audience: string;
}

const SYSTEM_PROMPT = [
  "Kamu adalah asisten penyusun basis pengetahuan (FAQ) untuk layanan akademik ",
  "universitas. Tugasmu mengekstrak pasangan pertanyaan-jawaban dari POTONGAN ",
  "DOKUMEN RESMI yang diberikan.",
  "",
  "ATURAN WAJIB:",
  "1. Gunakan HANYA informasi yang tertulis di potongan dokumen. Jangan menambah ",
  "   fakta apa pun (biaya, deadline, tanggal, jumlah SKS, nama pejabat, tautan, ",
  "   nomor telepon, syarat, prosedur, kebijakan, lokasi) yang tidak ada di teks.",
  "2. Bila informasi tidak cukup untuk menjawab dengan pasti, JANGAN membuat FAQ.",
  "3. Pertanyaan ditulis dalam Bahasa Indonesia yang natural (formal/ramah).",
  "4. Untuk setiap FAQ, buat 3–10 'alternative_questions' dengan variasi bahasa ",
  "   mahasiswa (formal, semi-formal, kasual, singkatan umum) TANPA mengubah makna ",
  "   dan TANPA menambah fakta.",
  "5. 'keywords' berisi 2–6 kata kunci relevan dari teks.",
  "6. 'audience' salah satu: MAHASISWA, CALON_MAHASISWA, ALUMNI, ORANG_TUA, UMUM ",
  "   (tebak dari konteks; kosongkan bila tidak yakin).",
  "7. 'category' nama kategori singkat yang paling sesuai (kosongkan bila tidak jelas).",
  "8. Kembalikan HANYA JSON array, tanpa teks lain.",
].join("\n");

/**
 * Generate kandidat FAQ dari satu chunk. Mengembalikan array kosong bila
 * chunk tidak memuat fakta yang cukup. Melempar LlmError pada kegagalan LLM.
 */
export async function generateCandidatesForChunk(
  chunk: { index: number; content: string },
  documentTitle: string,
): Promise<GeneratedCandidateFaq[]> {
  const userPrompt = [
    `DOKUMEN: ${documentTitle}`,
    `POTONGAN #${chunk.index + 1}:`,
    "",
    chunk.content,
    "",
    "Ekstrak semua pasangan FAQ yang dapat dijawab dari potongan di atas, dalam ",
    'bentuk JSON array dengan skema: ',
    '[{"question":"...","answer":"...","alternative_questions":["..."],',
    '"keywords":["..."],"category":"...","audience":"..."}]',
  ].join("\n");

  const raw = await chatCompletionJson<unknown>({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    json: true,
  });

  return sanitizeCandidates(raw);
}

/** Validasi + normalisasi hasil LLM menjadi daftar kandidat yang aman. */
export function sanitizeCandidates(raw: unknown): GeneratedCandidateFaq[] {
  const list = Array.isArray(raw) ? raw : [];
  const result: GeneratedCandidateFaq[] = [];

  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const question = str(o.question);
    const answer = str(o.answer);
    if (!question || !answer) continue;

    const alternativeQuestions = (Array.isArray(o.alternative_questions)
      ? o.alternative_questions.map(str).filter((s) => s.length > 0)
      : []
    ).slice(0, 10);

    const keywords = (Array.isArray(o.keywords)
      ? o.keywords.map(str).filter((s) => s.length > 0)
      : []
    ).slice(0, 30);

    result.push({
      question: question.slice(0, 1000),
      answer: answer.slice(0, 20000),
      alternativeQuestions,
      keywords,
      category: str(o.category).slice(0, 150),
      audience: str(o.audience).toUpperCase().slice(0, 50),
    });
  }

  return result;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export { LlmError };
