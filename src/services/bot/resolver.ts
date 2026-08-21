import "server-only";

import type { BotSettingsInput } from "@/lib/bot-settings-schema";
import { getBotSettings } from "@/lib/server/bot-settings";
import { normalizeText } from "@/services/rag/normalize";
import { logBotEventBestEffort } from "./analytics";
import { formatMenuText, getBotMenu, type BotMenuItem } from "./menu";
import {
  detectDeterministicIntent,
  detectSemanticGreeting,
  type IntentDetection,
  type IntentMatchMethod,
  normalizeIntentMessage,
} from "./smart-intent";

export type BotRoute = "WELCOME" | "MENU" | "QUESTION" | "THANKS";

export interface GreetingMetadata {
  detected: boolean;
  canonical: string | null;
  reply: string | null;
}

export interface BotResolveResult {
  success: true;
  route: BotRoute;
  reason: "GREETING" | "GREETING_WITH_QUESTION" | "NOISE" | "MENU_NUMBER" | "QUESTION" | "MAINTENANCE" | "THANKS";
  normalizedMessage: string;
  responseText: string | null;
  ragQuery: string | null;
  resolvedMenuItem: Pick<BotMenuItem, "number" | "faqId" | "question"> | null;
  requiresHuman: boolean;
  botStatus: BotSettingsInput["status"];
  matchedCanonicalRule: string | null;
  matchMethod: IntentMatchMethod | null;
  greeting: GreetingMetadata;
}

const NO_GREETING: GreetingMetadata = {
  detected: false,
  canonical: null,
  reply: null,
};

function stripEmoji(text: string): string {
  return text
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

const LEADING_GREETING =
  /^(?:(?:wa['’]?alaikum(?:(?:u?s+)alam)?|assalamu?\s*alaikum)|(?:halo|hallo|hai|hello|permisi)|(?:selamat\s+(?:pagi|siang|sore|malam)))(?:\s+(?:kak|kaka|admin|min|mimin|mas|mba|mbak|pak|bu|bro|gan))?(?:\s*[\p{Extended_Pictographic}\uFE0F\u200D]+)?(?:\s*[!,.]|(?=\s*\n)|(?=\s*$))\s*/iu;

function stripLeadingGreeting(text: string): string {
  let value = text.trim();
  while (LEADING_GREETING.test(value)) {
    value = value.replace(LEADING_GREETING, "").trimStart();
  }
  return value.trim();
}

/** Gabungkan prefix greeting dan body tanpa salam ganda atau salam generik AI. */
export function composeGreetingAwareText(
  greetingReply: string | null,
  body: string,
): string {
  const prefix = greetingReply?.trim() ?? "";
  const answerBody = prefix ? stripLeadingGreeting(body) : body.trim();
  return [prefix, answerBody].filter(Boolean).join("\n\n");
}

function greetingMetadata(
  detection: IntentDetection,
  settings: BotSettingsInput,
): GreetingMetadata {
  if (detection.matchedRule?.type !== "GREETING") return NO_GREETING;
  const configuredReply = detection.matchedRule.reply.trim();
  const reply = configuredReply
    ? settings.emojiEnabled
      ? configuredReply
      : stripEmoji(configuredReply)
    : null;
  return {
    detected: true,
    canonical:
      detection.matchedCanonicalRule ??
      normalizeIntentMessage(detection.matchedRule.phrase),
    reply: reply || null,
  };
}

function welcomeText(
  settings: BotSettingsInput,
  menuText: string,
  specificReply?: string,
): string {
  const parts: string[] = [];
  const effectiveReply = specificReply?.trim()
    ? settings.emojiEnabled
      ? specificReply.trim()
      : stripEmoji(specificReply)
    : null;
  if (settings.welcomeEnabled && settings.welcomeIntro.trim()) {
    const intro = settings.welcomeIntro.trim();
    const opening = composeGreetingAwareText(effectiveReply, intro);
    if (opening) parts.push(opening);
  } else if (effectiveReply) {
    parts.push(effectiveReply);
  }
  if (settings.includeMenu && menuText) parts.push(menuText);
  if (settings.welcomeClosing.trim()) parts.push(settings.welcomeClosing.trim());
  const value = parts.join("\n\n");
  return settings.emojiEnabled ? value : stripEmoji(value);
}

export async function resolveBotMessage(message: string): Promise<BotResolveResult> {
  const settings = await getBotSettings();
  const normalizedMessage = normalizeText(message);

  if (settings.status === "MAINTENANCE") {
    await logBotEventBestEffort({
      type: "GREETING",
      question: message,
      route: "WELCOME",
      metadata: { reason: "MAINTENANCE" },
    });
    return {
      success: true,
      route: "WELCOME",
      reason: "MAINTENANCE",
      normalizedMessage,
      responseText: settings.maintenanceMessage,
      ragQuery: null,
      resolvedMenuItem: null,
      requiresHuman: false,
      botStatus: settings.status,
      matchedCanonicalRule: null,
      matchMethod: null,
      greeting: NO_GREETING,
    };
  }

  let detection: IntentDetection = detectDeterministicIntent(message, settings.rules, {
    enabled: settings.smartGreetingEnabled,
    fuzzyEnabled: settings.fuzzyGreetingEnabled,
    semanticEnabled: settings.semanticGreetingEnabled,
    stripGreetingFromQuestion: settings.stripGreetingFromQuestion,
    similarityThreshold: settings.greetingSimilarityThreshold,
    modifiers: settings.greetingModifiers,
  });
  if (detection.intent === "UNKNOWN" && settings.smartGreetingEnabled && settings.semanticGreetingEnabled) {
    detection = (await detectSemanticGreeting(
      detection.normalizedMessage,
      settings.rules,
      settings.greetingSimilarityThreshold,
    )) ?? { ...detection, intent: "QUESTION", ragQuery: message.trim(), matchMethod: "NORMALIZED" };
  }

  const analyticsMetadata = {
    originalMessage: message,
    normalizedMessage: detection.normalizedMessage,
    detectedIntent: detection.greetingWithQuestion ? "QUESTION" : detection.intent,
    matchedCanonicalRule: detection.matchedCanonicalRule,
    matchMethod: detection.matchMethod,
  };
  const greeting = greetingMetadata(detection, settings);

  // 1. GREETING / NOISE
  if (detection.intent === "GREETING" || detection.intent === "NOISE") {
    const menu = await getBotMenu(settings);
    const menuText = formatMenuText(menu.items);
    const reason = detection.intent;
    await logBotEventBestEffort({
      type: "GREETING",
      question: message,
      route: "WELCOME",
      metadata: { reason, ...analyticsMetadata },
    });
    return {
      success: true,
      route: "WELCOME",
      reason,
      normalizedMessage: detection.normalizedMessage,
      responseText: welcomeText(settings, menuText, detection.matchedRule?.reply),
      ragQuery: null,
      resolvedMenuItem: null,
      requiresHuman: false,
      botStatus: settings.status,
      matchedCanonicalRule: detection.matchedCanonicalRule,
      matchMethod: detection.matchMethod,
      greeting,
    };
  }

  // 2. THANKS
  if (detection.intent === "THANKS") {
    await logBotEventBestEffort({
      type: "GREETING",
      question: message,
      route: "THANKS",
      metadata: { reason: "THANKS", ...analyticsMetadata },
    });
    return {
      success: true,
      route: "THANKS",
      reason: "THANKS",
      normalizedMessage: detection.normalizedMessage,
      responseText: null,
      ragQuery: null,
      resolvedMenuItem: null,
      requiresHuman: false,
      botStatus: settings.status,
      matchedCanonicalRule: null,
      matchMethod: detection.matchMethod ?? "NORMALIZED",
      greeting: NO_GREETING,
    };
  }

  // 3. MENU
  const menu = await getBotMenu(settings);
  if (/^\d{1,3}$/.test(normalizedMessage)) {
    const number = Number(normalizedMessage);
    const item = menu.items.find((candidate) => candidate.number === number);
    if (item) {
      await logBotEventBestEffort({
        type: "MENU_SELECTION",
        question: message,
        route: "MENU",
        matchedFaqId: item.faqId,
        metadata: {
          number,
          menuMode: menu.mode,
          originalMessage: message,
          normalizedMessage,
          detectedIntent: "MENU",
          matchedCanonicalRule: null,
          matchMethod: "EXACT",
        },
      });
      return {
        success: true,
        route: "MENU",
        reason: "MENU_NUMBER",
        normalizedMessage,
        responseText: null,
        ragQuery: item.question,
        resolvedMenuItem: {
          number: item.number,
          faqId: item.faqId,
          question: item.question,
        },
        requiresHuman: false,
        botStatus: settings.status,
        matchedCanonicalRule: null,
        matchMethod: "EXACT",
        greeting: NO_GREETING,
      };
    }
  }

  // 4. QUESTION
  await logBotEventBestEffort({
    type: "QUESTION",
    question: message,
    route: "QUESTION",
    metadata: analyticsMetadata,
  });
  return {
    success: true,
    route: "QUESTION",
    reason: detection.greetingWithQuestion ? "GREETING_WITH_QUESTION" : "QUESTION",
    normalizedMessage: detection.normalizedMessage,
    responseText: null,
    ragQuery: detection.ragQuery ?? message.trim(),
    resolvedMenuItem: null,
    requiresHuman: false,
    botStatus: settings.status,
    matchedCanonicalRule: detection.matchedCanonicalRule,
    matchMethod: detection.matchMethod,
    greeting,
  };
}
