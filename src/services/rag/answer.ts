/**
 * Pelengkap jawaban RAG yang diambil HANYA dari database (bukan buatan LLM):
 * sumber resmi, pertanyaan terkait/saran, media, dan lampiran.
 *
 * Server-only (memuat db + media-upload). Dipakai oleh /api/rag/context.
 *  - sumber resmi: hasil pencarian + tabel knowledge_item_sources (per FAQ).
 *  - saran: relasi eksplisit > kategori sama > kemiripan semantik.
 *  - media/lampiran: hanya untuk FAQ teratas; URL dibangun dari filePath
 *    (via /api/files/...) atau URL eksternal admin. Tidak ada base64.
 */

import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "@/db/client";
import {
  knowledgeAttachments,
  knowledgeItemSources,
  knowledgeItems,
  knowledgeMedia,
  knowledgeRelatedQuestions,
} from "@/db/schema";
import { fileUrlFromPath } from "@/lib/server/media-upload";
import type { SearchResult } from "./search";

/** Referensi sumber (metadata) yang dikirim ke n8n untuk sitasi. */
export interface RagSourceRef {
  id: string;
  type: "FAQ" | "CHUNK";
  title: string;
  url?: string | null;
  score: number;
}

/** Pertanyaan terkait yang disarankan (dari KB, bukan dari LLM). */
export interface RagSuggestion {
  /** ID FAQ terkait (null untuk teks bebas yang dipilih admin). */
  id: string | null;
  question: string;
}

export interface RagMediaItem {
  type: "IMAGE" | "VIDEO" | "OTHER";
  caption: string | null;
  /** URL publik yang bisa diakses bot (via /api/files/... atau URL eksternal). */
  url: string;
}

export interface RagAttachmentItem {
  title: string;
  type: "PDF" | "DOC" | "DOCX" | "XLS" | "XLSX" | "OTHER";
  fileName: string;
  fileSize: number;
  mimeType: string | null;
  url: string;
}

export interface RagAnswer {
  sources: RagSourceRef[];
  suggestions: RagSuggestion[];
  media: RagMediaItem[];
  attachments: RagAttachmentItem[];
}

const SUGGESTION_LIMIT = 5;

/** Sumber rujukan resmi: hasil pencarian + sumber per-FAQ (dedupe, dari DB). */
async function buildOfficialSources(results: SearchResult[]): Promise<RagSourceRef[]> {
  const refs: RagSourceRef[] = [];
  const seen = new Set<string>();

  // Ambil sumber resmi per-FAQ sekaligus (satu query untuk semua FAQ hasil).
  const faqIds = results.filter((r) => r.type === "FAQ").map((r) => r.id);
  const itemSourcesByFaq = new Map<string, { title: string; url: string | null }[]>();
  if (faqIds.length > 0) {
    const rows = await db
      .select({
        knowledgeId: knowledgeItemSources.knowledgeId,
        title: knowledgeItemSources.title,
        url: knowledgeItemSources.url,
      })
      .from(knowledgeItemSources)
      .where(inArray(knowledgeItemSources.knowledgeId, faqIds))
      .orderBy(asc(knowledgeItemSources.sortOrder));
    for (const row of rows) {
      const list = itemSourcesByFaq.get(row.knowledgeId) ?? [];
      list.push({ title: row.title, url: row.url });
      itemSourcesByFaq.set(row.knowledgeId, list);
    }
  }

  for (const r of results) {
    const refKey = `${r.type}:${r.id}`;
    if (!seen.has(refKey)) {
      seen.add(refKey);
      refs.push({
        id: r.id,
        type: r.type,
        title: r.type === "CHUNK" ? r.source ?? "Dokumen" : r.question ?? "FAQ",
        url: r.url ?? null,
        score: r.score,
      });
    }
    if (r.type === "FAQ") {
      for (const s of itemSourcesByFaq.get(r.id) ?? []) {
        const itemKey = `item:${s.title}|${s.url ?? ""}`;
        if (seen.has(itemKey)) continue;
        seen.add(itemKey);
        refs.push({
          id: r.id,
          type: "FAQ",
          title: s.title,
          url: s.url || null,
          score: r.score,
        });
      }
    }
  }

  return refs;
}

/**
 * Pertanyaan terkait untuk jawaban teratas, prioritas:
 * 1) relasi eksplisit yang dipilih admin (knowledge_related_questions);
 * 2) FAQ aktif lain pada kategori yang sama;
 * 3) FAQ lain yang relevan secara semantik (hasil pencarian).
 * Selalu dedupe dan batasi, tanpa melibatkan LLM.
 */
async function buildSuggestions(
  top: SearchResult,
  results: SearchResult[],
): Promise<RagSuggestion[]> {
  const suggestions: RagSuggestion[] = [];
  const seen = new Set<string>();

  const push = (id: string | null, question: string | null | undefined) => {
    const q = (question ?? "").trim();
    if (!q || seen.has(q)) return;
    seen.add(q);
    suggestions.push({ id, question: q });
  };

  if (top.type === "FAQ") {
    // 1) Relasi eksplisit (urutan admin).
    const relations = await db.query.knowledgeRelatedQuestions.findMany({
      where: eq(knowledgeRelatedQuestions.knowledgeId, top.id),
      columns: { relatedKnowledgeId: true, question: true },
      orderBy: (t, { asc }) => asc(t.sortOrder),
    });
    for (const rel of relations) push(rel.relatedKnowledgeId, rel.question);

    // 2) Kategori sama (FAQ aktif lain, urut abjad).
    const topFaq = await db.query.knowledgeItems.findFirst({
      where: and(eq(knowledgeItems.id, top.id), isNull(knowledgeItems.deletedAt)),
      columns: { id: true, categoryId: true },
    });
    if (topFaq?.categoryId) {
      const sameCategory = await db.query.knowledgeItems.findMany({
        where: and(
          eq(knowledgeItems.categoryId, topFaq.categoryId),
          eq(knowledgeItems.status, "ACTIVE"),
          ne(knowledgeItems.id, top.id),
          isNull(knowledgeItems.deletedAt),
        ),
        columns: { id: true, question: true },
        orderBy: (t, { asc }) => asc(t.question),
        limit: SUGGESTION_LIMIT,
      });
      for (const row of sameCategory) push(row.id, row.question);
    }
  }

  // 3) Kemiripan semantik — FAQ lain pada hasil pencarian (di luar jawaban utama).
  for (const r of results) {
    if (r.type !== "FAQ" || r.id === top.id) continue;
    push(r.id, r.question);
    if (suggestions.length >= SUGGESTION_LIMIT) break;
  }

  return suggestions.slice(0, SUGGESTION_LIMIT);
}

/** Media FAQ teratas (gambar/URL eksternal) — URL publik, bukan base64. */
async function buildMedia(faqId: string): Promise<RagMediaItem[]> {
  const rows = await db.query.knowledgeMedia.findMany({
    where: eq(knowledgeMedia.knowledgeId, faqId),
    columns: { type: true, caption: true, url: true, filePath: true },
    orderBy: (t, { asc }) => asc(t.sortOrder),
  });

  const items: RagMediaItem[] = [];
  for (const row of rows) {
    const fileUrl = fileUrlFromPath(row.filePath);
    const url = fileUrl ?? row.url;
    if (!url) continue;
    items.push({ type: row.type, caption: row.caption ?? null, url });
  }
  return items;
}

/** Lampiran FAQ teratas — metadata + URL file (filePath → /api/files/...). */
async function buildAttachments(faqId: string): Promise<RagAttachmentItem[]> {
  const rows = await db.query.knowledgeAttachments.findMany({
    where: eq(knowledgeAttachments.knowledgeId, faqId),
    columns: {
      title: true,
      type: true,
      fileName: true,
      fileSize: true,
      mimeType: true,
      filePath: true,
      url: true,
    },
    orderBy: (t, { asc }) => asc(t.sortOrder),
  });

  const items: RagAttachmentItem[] = [];
  for (const row of rows) {
    // Lampiran bisa berupa file upload (filePath → /api/files/...) atau
    // URL eksternal (bulk import). Prioritaskan file upload.
    const url = fileUrlFromPath(row.filePath) ?? row.url;
    if (!url) continue;
    items.push({
      title: row.title,
      type: row.type,
      fileName: row.fileName,
      fileSize: row.fileSize,
      mimeType: row.mimeType ?? null,
      url,
    });
  }
  return items;
}

/**
 * Muat pelengkap jawaban dari DB untuk hasil pencarian RAG.
 * Sumber: FAQ hasil + item_sources; media/lampiran hanya untuk FAQ teratas;
 * saran: relasi eksplisit > kategori sama > kemiripan semantik.
 */
export async function buildRagAnswer(results: SearchResult[]): Promise<RagAnswer> {
  const sources = await buildOfficialSources(results);
  const top = results[0];

  if (!top) {
    return { sources, suggestions: [], media: [], attachments: [] };
  }

  if (top.type === "FAQ") {
    const [suggestions, media, attachments] = await Promise.all([
      buildSuggestions(top, results),
      buildMedia(top.id),
      buildAttachments(top.id),
    ]);
    return { sources, suggestions, media, attachments };
  }

  // Top berupa chunk dokumen: saran dari FAQ relevan lain, tanpa media/lampiran.
  const suggestions = await buildSuggestions(top, results);
  return { sources, suggestions, media: [], attachments: [] };
}
