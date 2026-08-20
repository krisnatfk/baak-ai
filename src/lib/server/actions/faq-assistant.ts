"use server";

import { z } from "zod";
import { requireRole } from "@/lib/guards";
import {
  findSimilarFaqs,
  generateFaqKeywords,
  generateQuestionVariations,
  improveFaqAnswer,
} from "@/services/faq/assistant";

const text = z.string().trim().min(3).max(20_000);

export async function improveFaqAnswerAction(input: {
  answer: string;
  style: "SINGKAT" | "NORMAL" | "LENGKAP";
}) {
  await requireRole("ADMIN", "SUPER_ADMIN");
  const parsed = z.object({ answer: text, style: z.enum(["SINGKAT", "NORMAL", "LENGKAP"]) }).safeParse(input);
  if (!parsed.success) return { ok: false as const, message: "Jawaban atau gaya tidak valid." };
  try {
    return { ok: true as const, suggestion: await improveFaqAnswer(parsed.data.answer, parsed.data.style) };
  } catch (error) {
    return { ok: false as const, message: (error as Error).message };
  }
}

export async function generateQuestionVariationsAction(question: string) {
  await requireRole("ADMIN", "SUPER_ADMIN");
  const parsed = text.safeParse(question);
  if (!parsed.success) return { ok: false as const, message: "Pertanyaan belum valid." };
  try {
    return { ok: true as const, variations: await generateQuestionVariations(parsed.data) };
  } catch (error) {
    return { ok: false as const, message: (error as Error).message };
  }
}

export async function generateFaqKeywordsAction(input: { question: string; answer: string }) {
  await requireRole("ADMIN", "SUPER_ADMIN");
  const parsed = z.object({ question: text, answer: text }).safeParse(input);
  if (!parsed.success) return { ok: false as const, message: "Pertanyaan atau jawaban belum valid." };
  try {
    return { ok: true as const, keywords: await generateFaqKeywords(parsed.data.question, parsed.data.answer) };
  } catch (error) {
    return { ok: false as const, message: (error as Error).message };
  }
}

export async function findSimilarFaqsAction(question: string, excludeId?: string) {
  await requireRole("ADMIN", "SUPER_ADMIN");
  const parsed = text.safeParse(question);
  if (!parsed.success) return { ok: false as const, message: "Pertanyaan belum valid." };
  try {
    return { ok: true as const, candidates: await findSimilarFaqs(parsed.data, excludeId) };
  } catch (error) {
    return { ok: false as const, message: (error as Error).message };
  }
}

