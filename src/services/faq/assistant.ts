import "server-only";

import { chatCompletion, chatCompletionJson } from "@/services/llm/client";
import { semanticSearch } from "@/services/rag/search";
import { normalizeText } from "@/services/rag/normalize";

export type ImproveStyle = "SINGKAT" | "NORMAL" | "LENGKAP";

const SENSITIVE_GROUPS: Array<{ label: string; pattern: RegExp }> = [
  { label: "biaya", pattern: /\b(biaya|harga|ukt|spp|rupiah|rp\.?|gratis)\b/i },
  { label: "tanggal/jadwal", pattern: /\b(tanggal|jadwal|deadline|batas akhir|gelombang|hari|bulan|tahun)\b/i },
  { label: "syarat", pattern: /\b(syarat|persyaratan|wajib|dokumen|berkas)\b/i },
  { label: "kontak", pattern: /\b(telepon|telp|nomor|whatsapp|wa|hubungi|kontak)\b/i },
  { label: "program studi", pattern: /\b(program studi|prodi|jurusan|fakultas)\b/i },
];

function uniqueMatches(text: string, pattern: RegExp): string[] {
  return [...new Set(text.match(pattern) ?? [])].map((item) => item.toLowerCase());
}

export function factPreservationIssues(original: string, suggestion: string): string[] {
  const issues: string[] = [];
  const originalUrls = new Set(
    uniqueMatches(original, /https?:\/\/[^\s)]+|www\.[^\s)]+/gi),
  );
  for (const url of uniqueMatches(suggestion, /https?:\/\/[^\s)]+|www\.[^\s)]+/gi)) {
    if (!originalUrls.has(url)) issues.push(`URL baru: ${url}`);
  }
  const originalNumbers = new Set(uniqueMatches(original, /\b\d[\d.,/-]*\b/g));
  for (const number of uniqueMatches(suggestion, /\b\d[\d.,/-]*\b/g)) {
    if (!originalNumbers.has(number)) issues.push(`angka baru: ${number}`);
  }
  for (const group of SENSITIVE_GROUPS) {
    if (!group.pattern.test(original) && group.pattern.test(suggestion)) {
      issues.push(`fakta ${group.label} baru`);
    }
  }
  return [...new Set(issues)];
}

const CHANNEL_TERMS = [
  "online",
  "offline",
  "website",
  "email",
  "aplikasi",
  "loket",
  "kampus",
] as const;

function qualityIssues(original: string, suggestion: string): string[] {
  const issues: string[] = [];
  if (/\b\w+_\w+\b|\[[^\]]*(?:pengguna|nama|placeholder)[^\]]*\]/i.test(suggestion)) {
    issues.push("placeholder/artefak model");
  }
  for (const term of CHANNEL_TERMS) {
    const pattern = new RegExp(`\\b${term}\\b`, "i");
    if (pattern.test(original) && !pattern.test(suggestion)) {
      issues.push(`informasi ${term} hilang`);
    }
  }
  return issues;
}

function deterministicPolish(answer: string): string {
  const cleaned = answer.replace(/\s+/g, " ").trim();
  if (!cleaned) return cleaned;
  const normalized = cleaned[0].toUpperCase() + cleaned.slice(1);
  const punctuated = /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
  return /^(tentu|baik|halo|hai)\b/i.test(punctuated)
    ? punctuated
    : `Tentu, Kak. ${punctuated}`;
}

export async function improveFaqAnswer(
  answer: string,
  style: ImproveStyle,
): Promise<string> {
  const styleInstruction = {
    SINGKAT: "Buat 1-2 paragraf pendek.",
    NORMAL: "Buat jawaban ramah, jelas, dan ringkas.",
    LENGKAP: "Perjelas struktur secara lebih detail tanpa menambah fakta.",
  }[style];
  let lastIssues: string[] = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const suggestion = await chatCompletion({
      temperature: 0.05,
      maxTokens: 1200,
      messages: [
        {
          role: "system",
          content:
            "Kamu adalah editor jawaban FAQ PMB berbahasa Indonesia. Tulis ramah dan natural. PRESERVE FACTS: semua kanal/cara seperti online, offline, website, email, aplikasi, loket, atau kampus yang ada wajib tetap ditulis persis. IMPROVE WRITING ONLY. Jangan memakai placeholder, token bergaris bawah, atau instruksi meta. Dilarang menambah biaya, angka, tanggal, jadwal, syarat, URL, nomor telepon, nama program studi, kebijakan, atau fakta apa pun yang tidak ada dalam teks asli. Kembalikan hanya jawaban hasil perbaikan.",
        },
        {
          role: "user",
          content: `${styleInstruction}\n${attempt > 0 ? "Percobaan sebelumnya tidak menjaga semua istilah asli. Salin semua istilah faktual penting.\n" : ""}\nTEKS ASLI:\n${answer}`,
        },
      ],
    });
    lastIssues = [
      ...factPreservationIssues(answer, suggestion),
      ...qualityIssues(answer, suggestion),
    ];
    if (lastIssues.length === 0) return suggestion.trim();
  }
  const fallback = deterministicPolish(answer);
  const fallbackIssues = factPreservationIssues(answer, fallback);
  if (fallbackIssues.length > 0) {
    throw new Error(`Saran AI ditolak karena terdeteksi ${lastIssues.join(", ")}.`);
  }
  return fallback;
}

export async function generateQuestionVariations(question: string): Promise<string[]> {
  const payload = await chatCompletionJson<{ variations?: unknown }>({
    temperature: 0.3,
    maxTokens: 700,
    messages: [
      {
        role: "system",
        content:
          "Buat variasi pertanyaan Bahasa Indonesia untuk FAQ PMB tanpa mengubah makna dan tanpa menambah fakta. Kembalikan JSON {\"variations\":[\"...\"]}.",
      },
      { role: "user", content: question },
    ],
    json: true,
  });
  const source = Array.isArray(payload.variations) ? payload.variations : [];
  const original = normalizeText(question);
  const generated = [...new Set(source.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter((item) => item.length >= 3 && normalizeText(item) !== original))].slice(0, 10);
  if (generated.length > 0) return generated;
  const clean = question.trim().replace(/[?.!]+$/, "");
  const lower = clean[0]?.toLowerCase() + clean.slice(1);
  return [
    `Mohon dijelaskan, ${lower}?`,
    `Saya ingin mengetahui: ${clean}.`,
    `Mohon informasi mengenai pertanyaan ini: ${clean}.`,
  ].filter((item) => normalizeText(item) !== original);
}

const KEYWORD_STOPWORDS = new Set([
  "yang", "dan", "atau", "untuk", "dengan", "dari", "pada", "dalam",
  "adalah", "dilakukan", "melakukan", "bagaimana", "cara", "melalui",
  "saya", "ingin", "mohon", "informasi", "apakah", "bisa", "dapat",
]);

function extractKeywords(question: string, answer: string): string[] {
  return [...new Set(
    `${question} ${answer}`
      .toLowerCase()
      .replace(/[^\p{L}\p{N}-]+/gu, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 3 && !KEYWORD_STOPWORDS.has(word)),
  )].slice(0, 8);
}

export async function generateFaqKeywords(question: string, answer: string): Promise<string[]> {
  const payload = await chatCompletionJson<{ keywords?: unknown }>({
    temperature: 0.1,
    maxTokens: 400,
    messages: [
      {
        role: "system",
        content:
          "Ekstrak 3-8 kata kunci dari teks FAQ. Jangan menambah fakta. Kembalikan JSON {\"keywords\":[\"...\"]}.",
      },
      { role: "user", content: `PERTANYAAN:\n${question}\n\nJAWABAN:\n${answer}` },
    ],
    json: true,
  });
  const source = Array.isArray(payload.keywords) ? payload.keywords : [];
  const generated = [...new Set(source.filter((item): item is string => typeof item === "string").map((item) => item.trim().toLowerCase()).filter(Boolean))].slice(0, 8);
  return generated.length > 0 ? generated : extractKeywords(question, answer);
}

export interface SimilarFaqCandidate {
  faqId: string;
  question: string;
  score: number;
}

export async function findSimilarFaqs(
  question: string,
  excludeId?: string,
  limit = 5,
): Promise<SimilarFaqCandidate[]> {
  const { results } = await semanticSearch(question, Math.min(limit + 2, 10), undefined, 0.35);
  return results
    .filter(
      (result) =>
        result.type === "FAQ" &&
        result.id !== excludeId &&
        Boolean(result.question?.trim()),
    )
    .slice(0, limit)
    .map((result) => ({
      faqId: result.id,
      question: result.question!,
      score: Number(result.score.toFixed(4)),
    }));
}
