import "server-only";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  knowledgeItems,
  retrievalLogs,
  type Audience,
} from "@/db/schema";
import { getRagConfig } from "@/lib/env";
import type { BotSettingsInput } from "@/lib/bot-settings-schema";
import { getBotSettings } from "@/lib/server/bot-settings";
import { fileUrlFromPath } from "@/lib/server/media-upload";

export type BotMenuSource = "MANUAL" | "PINNED" | "POPULAR";

export interface BotMenuItem {
  /** Backward-compatible ID. Null hanya untuk configurable final item. */
  id: string | null;
  faqId: string | null;
  number: number;
  question: string;
  answer: string;
  menuOrder: number | null;
  source: BotMenuSource;
  sources: Array<{ title: string; type: string; url?: string }>;
  media: Array<{
    type: string;
    caption?: string;
    url: string;
    mimeType?: string;
  }>;
  attachments: Array<{
    title: string;
    type: string;
    url: string;
    mimeType?: string;
    fileSize: number;
  }>;
}

const LEGACY_DOMAIN_RE = /\b(pkl|krs|khs|wisuda|yudisium|cuti|skripsi|magang)\b/i;

function isAllowedPmbFaq(item: { question: string; answer: string }): boolean {
  return !LEGACY_DOMAIN_RE.test(`${item.question} ${item.answer}`);
}

function eligibleWhere() {
  const config = getRagConfig();
  return and(
    eq(knowledgeItems.status, "ACTIVE"),
    isNull(knowledgeItems.deletedAt),
    inArray(knowledgeItems.audience, config.defaultAudiences as Audience[]),
  );
}

async function pinnedIds(limit: number): Promise<string[]> {
  const rows = await db
    .select({
      id: knowledgeItems.id,
      question: knowledgeItems.question,
      answer: knowledgeItems.answer,
    })
    .from(knowledgeItems)
    .where(and(eligibleWhere(), eq(knowledgeItems.showInMainMenu, true)))
    .orderBy(asc(knowledgeItems.mainMenuOrder), asc(knowledgeItems.id))
    .limit(Math.max(limit * 3, limit));
  return rows.filter(isAllowedPmbFaq).slice(0, limit).map((row) => row.id);
}

async function popularIds(
  periodDays: number,
  limit: number,
  excluded: string[] = [],
): Promise<string[]> {
  const rows = await db
    .select({
      id: knowledgeItems.id,
      question: knowledgeItems.question,
      answer: knowledgeItems.answer,
      hits: sql<number>`count(${retrievalLogs.id})::int`,
    })
    .from(knowledgeItems)
    .innerJoin(
      retrievalLogs,
      and(
        eq(retrievalLogs.bestKnowledgeId, knowledgeItems.id),
        sql`${retrievalLogs.createdAt} >= now() - (${periodDays} * interval '1 day')`,
      ),
    )
    .where(eligibleWhere())
    .groupBy(knowledgeItems.id, knowledgeItems.question, knowledgeItems.answer)
    .orderBy(desc(sql`count(${retrievalLogs.id})`), asc(knowledgeItems.question))
    .limit(Math.max(limit * 4, limit));

  const excludedSet = new Set(excluded);
  return rows
    .filter((row) => row.hits > 0 && !excludedSet.has(row.id) && isAllowedPmbFaq(row))
    .slice(0, limit)
    .map((row) => row.id);
}

async function hydrateMenuItems(
  selections: Array<{ id: string; source: BotMenuSource }>,
): Promise<BotMenuItem[]> {
  if (selections.length === 0) return [];
  const rows = await db.query.knowledgeItems.findMany({
    where: inArray(
      knowledgeItems.id,
      selections.map((item) => item.id),
    ),
    columns: {
      id: true,
      question: true,
      answer: true,
      mainMenuOrder: true,
    },
    with: {
      itemSources: {
        columns: { title: true, type: true, url: true },
        orderBy: (table, { asc }) => asc(table.sortOrder),
      },
      media: {
        columns: {
          id: true,
          type: true,
          caption: true,
          url: true,
          filePath: true,
          mimeType: true,
        },
        orderBy: (table, { asc }) => asc(table.sortOrder),
      },
      attachments: {
        columns: {
          id: true,
          title: true,
          type: true,
          url: true,
          filePath: true,
          mimeType: true,
          fileSize: true,
        },
        orderBy: (table, { asc }) => asc(table.sortOrder),
      },
    },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));

  const hydrated: BotMenuItem[] = [];
  for (const [index, selection] of selections.entries()) {
    const row = byId.get(selection.id);
    if (!row) continue;
    const media = await Promise.all(
      row.media.map(async (item) => {
        const url = item.url ?? (await fileUrlFromPath(item.filePath));
        if (!url) return null;
        return {
          type: item.type,
          caption: item.caption ?? undefined,
          url,
          mimeType: item.mimeType ?? undefined,
        };
      }),
    );
    const attachments = await Promise.all(
      row.attachments.map(async (item) => {
        const url = item.url ?? (await fileUrlFromPath(item.filePath));
        if (!url) return null;
        return {
          title: item.title,
          type: item.type,
          url,
          mimeType: item.mimeType ?? undefined,
          fileSize: item.fileSize,
        };
      }),
    );
    hydrated.push({
      id: row.id,
      faqId: row.id,
      number: index + 1,
      question: row.question,
      answer: row.answer,
      menuOrder: row.mainMenuOrder,
      source: selection.source,
      sources: row.itemSources.map((item) => ({
        title: item.title,
        type: item.type,
        url: item.url ?? undefined,
      })),
      media: media.filter((item) => item !== null),
      attachments: attachments.filter((item) => item !== null),
    });
  }
  return hydrated;
}

export async function getBotMenu(
  providedSettings?: BotSettingsInput,
): Promise<{ mode: BotSettingsInput["menuMode"]; items: BotMenuItem[] }> {
  const settings = providedSettings ?? (await getBotSettings());
  const reserveFinal = settings.menuFinalLabel.trim().length > 0 ? 1 : 0;
  const faqLimit = Math.max(0, settings.menuLimit - reserveFinal);
  let selections: Array<{ id: string; source: BotMenuSource }> = [];

  if (settings.menuMode === "MANUAL") {
    selections = composeMenuSelections(
      settings.menuMode,
      await pinnedIds(faqLimit),
      [],
      faqLimit,
    );
  } else if (settings.menuMode === "POPULAR") {
    selections = composeMenuSelections(
      settings.menuMode,
      [],
      await popularIds(settings.popularPeriodDays, faqLimit),
      faqLimit,
    );
  } else {
    const pinned = await pinnedIds(faqLimit);
    const popular = await popularIds(
      settings.popularPeriodDays,
      Math.max(0, faqLimit - pinned.length),
      pinned,
    );
    selections = composeMenuSelections(settings.menuMode, pinned, popular, faqLimit);
  }

  const items = await hydrateMenuItems(selections);
  if (settings.menuFinalLabel.trim() && items.length < settings.menuLimit) {
    items.push({
      id: null,
      faqId: null,
      number: items.length + 1,
      question: settings.menuFinalLabel.trim(),
      answer: "",
      menuOrder: null,
      source: "MANUAL",
      sources: [],
      media: [],
      attachments: [],
    });
  }
  return { mode: settings.menuMode, items };
}

export function formatMenuText(items: BotMenuItem[]): string {
  if (items.length === 0) return "";
  return items.map((item) => `${item.number}. ${item.question}`).join("\n");
}

export function composeMenuSelections(
  mode: BotSettingsInput["menuMode"],
  pinned: string[],
  popular: string[],
  limit: number,
): Array<{ id: string; source: BotMenuSource }> {
  if (mode === "MANUAL") {
    return pinned.slice(0, limit).map((id) => ({ id, source: "MANUAL" }));
  }
  if (mode === "POPULAR") {
    return popular.slice(0, limit).map((id) => ({ id, source: "POPULAR" }));
  }
  const pinnedSelection = pinned.slice(0, limit);
  const seen = new Set(pinnedSelection);
  const popularSelection = popular
    .filter((id) => !seen.has(id))
    .slice(0, Math.max(0, limit - pinnedSelection.length));
  return [
    ...pinnedSelection.map((id) => ({ id, source: "PINNED" as const })),
    ...popularSelection.map((id) => ({ id, source: "POPULAR" as const })),
  ];
}
