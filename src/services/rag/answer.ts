import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  knowledgeAttachments,
  knowledgeItemSources,
  knowledgeMedia,
} from "@/db/schema";
import { getRagConfig } from "@/lib/env";
import { fileUrlFromPath } from "@/lib/server/media-upload";
import type { SearchResult } from "./search";

export interface RagSourceRef {
  id: string;
  type: "FAQ" | "CHUNK";
  title: string;
  url?: string | null;
  score: number;
}

export interface RagSuggestion {
  /** `id` dipertahankan untuk konsumen lama; `faqId` kontrak baru. */
  id: string;
  faqId: string;
  question: string;
  score: number;
}

export interface RagMediaItem {
  type: "IMAGE" | "VIDEO" | "OTHER";
  caption: string | null;
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

export interface RagAnswerOptions {
  thresholdMedium?: number;
  suggestionEnabled?: boolean;
  maxSuggestions?: number;
}

async function buildOfficialSources(results: SearchResult[]): Promise<RagSourceRef[]> {
  const refs: RagSourceRef[] = [];
  const seen = new Set<string>();
  const faqIds = results.filter((result) => result.type === "FAQ").map((result) => result.id);
  const itemSourcesByFaq = new Map<string, Array<{ title: string; url: string | null }>>();
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

  for (const result of results) {
    const resultKey = `${result.type}:${result.id}`;
    if (!seen.has(resultKey)) {
      seen.add(resultKey);
      refs.push({
        id: result.id,
        type: result.type,
        title:
          result.type === "CHUNK"
            ? result.source ?? "Dokumen"
            : result.question ?? "FAQ",
        url: result.url ?? null,
        score: result.score,
      });
    }
    if (result.type === "FAQ") {
      for (const source of itemSourcesByFaq.get(result.id) ?? []) {
        const sourceKey = `item:${source.title}|${source.url ?? ""}`;
        if (seen.has(sourceKey)) continue;
        seen.add(sourceKey);
        refs.push({
          id: result.id,
          type: "FAQ",
          title: source.title,
          url: source.url || null,
          score: result.score,
        });
      }
    }
  }
  return refs;
}

/** Suggestions hanya berasal dari kandidat semantic PMB yang sudah difilter search. */
export async function buildSemanticSuggestions(
  top: SearchResult,
  results: SearchResult[],
  options: RagAnswerOptions = {},
): Promise<RagSuggestion[]> {
  if (options.suggestionEnabled === false) return [];
  const limit = Math.max(0, Math.min(options.maxSuggestions ?? 5, 10));
  const seen = new Set<string>();
  const suggestions: RagSuggestion[] = [];
  for (const result of results) {
    const question = result.question?.trim();
    const normalized = question?.toLocaleLowerCase("id-ID");
    if (
      result.type !== "FAQ" ||
      result.id === top.id ||
      !question ||
      !normalized ||
      seen.has(normalized)
    ) continue;
    seen.add(normalized);
    suggestions.push({
      id: result.id,
      faqId: result.id,
      question,
      score: Number(result.score.toFixed(4)),
    });
    if (suggestions.length >= limit) break;
  }
  return suggestions;
}

async function buildMedia(faqId: string): Promise<RagMediaItem[]> {
  const rows = await db.query.knowledgeMedia.findMany({
    where: eq(knowledgeMedia.knowledgeId, faqId),
    columns: { id: true, type: true, caption: true, url: true, filePath: true },
    orderBy: (table, { asc }) => asc(table.sortOrder),
  });
  const items: RagMediaItem[] = [];
  for (const row of rows) {
    let url = row.url;
    if (row.filePath) {
      const localUrl = await fileUrlFromPath(row.filePath);
      if (localUrl) url = localUrl;
      else console.warn(`[RAG_ASSET_MISSING] ${JSON.stringify({ type: "media", faqId, mediaId: row.id, filePath: row.filePath })}`);
    }
    if (url) items.push({ type: row.type, caption: row.caption ?? null, url });
  }
  return items;
}

async function buildAttachments(faqId: string): Promise<RagAttachmentItem[]> {
  const rows = await db.query.knowledgeAttachments.findMany({
    where: eq(knowledgeAttachments.knowledgeId, faqId),
    columns: {
      id: true,
      title: true,
      type: true,
      fileName: true,
      fileSize: true,
      mimeType: true,
      filePath: true,
      url: true,
    },
    orderBy: (table, { asc }) => asc(table.sortOrder),
  });
  const items: RagAttachmentItem[] = [];
  for (const row of rows) {
    let url = row.url;
    if (row.filePath) {
      const localUrl = await fileUrlFromPath(row.filePath);
      if (localUrl) url = localUrl;
      else console.warn(`[RAG_ASSET_MISSING] ${JSON.stringify({ type: "attachment", faqId, attachmentId: row.id, filePath: row.filePath })}`);
    }
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

export async function buildRagAnswer(
  results: SearchResult[],
  options: RagAnswerOptions = {},
): Promise<RagAnswer> {
  const top = results[0];
  if (!top) return { sources: [], suggestions: [], media: [], attachments: [] };
  const suggestions = await buildSemanticSuggestions(top, results, options);
  const thresholdMedium = options.thresholdMedium ?? getRagConfig().thresholdMedium;
  if (top.score < thresholdMedium) {
    return { sources: [], suggestions, media: [], attachments: [] };
  }
  const sources = await buildOfficialSources([top]);
  if (top.type === "FAQ") {
    const [media, attachments] = await Promise.all([
      buildMedia(top.id),
      buildAttachments(top.id),
    ]);
    return { sources, suggestions, media, attachments };
  }
  return { sources, suggestions, media: [], attachments: [] };
}

