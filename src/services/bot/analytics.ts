import "server-only";

import { db } from "@/db/client";
import { botAnalyticsEvents } from "@/db/schema";
import { normalizeText } from "@/services/rag/normalize";

type BotEventType = typeof botAnalyticsEvents.$inferInsert.type;

export interface BotEventInput {
  type: BotEventType;
  question?: string | null;
  route?: "WELCOME" | "MENU" | "QUESTION" | "THANKS" | null;
  matchedFaqId?: string | null;
  confidence?: string | null;
  score?: number | null;
  metadata?: Record<string, unknown> | null;
}

export async function logBotEvent(input: BotEventInput): Promise<void> {
  await db.insert(botAnalyticsEvents).values({
    type: input.type,
    normalizedQuestion: input.question ? normalizeText(input.question) : null,
    route: input.route ?? null,
    matchedFaqId: input.matchedFaqId ?? null,
    confidence: input.confidence ?? null,
    score: input.score == null ? null : input.score.toFixed(4),
    metadata: input.metadata ?? null,
  });
}

export async function logBotEventBestEffort(input: BotEventInput): Promise<void> {
  try {
    await logBotEvent(input);
  } catch (error) {
    console.error("[bot-analytics] Gagal mencatat event:", error);
  }
}

