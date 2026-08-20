"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { botMessageRules, botSettings } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { botSettingsInputSchema } from "@/lib/bot-settings-schema";
import { requireRole } from "@/lib/guards";
import { normalizeText } from "@/services/rag/normalize";
import { fail, ok, zodFail, type ActionResult } from "./shared";

export async function updateBotSettings(input: unknown): Promise<ActionResult> {
  const user = await requireRole("ADMIN", "SUPER_ADMIN");
  const parsed = botSettingsInputSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const data = parsed.data;

  const seen = new Set<string>();
  const rules: Array<{
    id?: string;
    type: "GREETING" | "NOISE";
    phrase: string;
    reply: string;
    isActive: boolean;
    normalizedPhrase: string;
    sortOrder: number;
  }> = [];
  for (const [index, rule] of data.rules.entries()) {
    const normalizedPhrase = normalizeText(rule.phrase);
    if (!normalizedPhrase) return fail(`Rule ke-${index + 1} tidak valid.`);
    const key = `${rule.type}:${normalizedPhrase}`;
    if (seen.has(key)) return fail(`Rule duplikat: ${rule.phrase}`);
    seen.add(key);
    rules.push({ ...rule, normalizedPhrase, sortOrder: index });
  }

  const [old] = await db
    .select()
    .from(botSettings)
    .where(eq(botSettings.id, "default"))
    .limit(1);

  await db.transaction(async (tx) => {
    await tx
      .insert(botSettings)
      .values({
        id: "default",
        botName: data.botName,
        institutionName: data.institutionName,
        userCallName: data.userCallName,
        welcomeEnabled: data.welcomeEnabled,
        welcomeIntro: data.welcomeIntro,
        welcomeClosing: data.welcomeClosing,
        includeMenu: data.includeMenu,
        emojiEnabled: data.emojiEnabled,
        smartGreetingEnabled: data.smartGreetingEnabled,
        fuzzyGreetingEnabled: data.fuzzyGreetingEnabled,
        semanticGreetingEnabled: data.semanticGreetingEnabled,
        stripGreetingFromQuestion: data.stripGreetingFromQuestion,
        greetingSimilarityThreshold: data.greetingSimilarityThreshold.toFixed(4),
        greetingModifiers: data.greetingModifiers,
        menuMode: data.menuMode,
        popularPeriodDays: data.popularPeriodDays,
        menuLimit: data.menuLimit,
        menuFinalLabel: data.menuFinalLabel || null,
        similarityEnabled: data.similarityEnabled,
        similarityHigh: data.similarityHigh.toFixed(4),
        similarityMedium: data.similarityMedium.toFixed(4),
        similaritySuggestionEnabled: data.similaritySuggestionEnabled,
        similarityMaxSuggestions: data.similarityMaxSuggestions,
        notFoundMessage: data.notFoundMessage,
        showSuggestionsOnNotFound: data.showSuggestionsOnNotFound,
        showMenuOnNotFound: data.showMenuOnNotFound,
        status: data.status,
        maintenanceMessage: data.maintenanceMessage,
        humanHandoffEnabled: data.humanHandoffEnabled,
        humanHandoffMessage: data.humanHandoffMessage,
        humanHandoffUrl: data.humanHandoffUrl || null,
        humanHandoffPhone: data.humanHandoffPhone || null,
        humanHandoffAfterUnanswered: data.humanHandoffAfterUnanswered,
        answerStyle: data.answerStyle,
        answerTone: data.answerTone,
        updatedBy: user.id,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: botSettings.id,
        set: {
          botName: data.botName,
          institutionName: data.institutionName,
          userCallName: data.userCallName,
          welcomeEnabled: data.welcomeEnabled,
          welcomeIntro: data.welcomeIntro,
          welcomeClosing: data.welcomeClosing,
          includeMenu: data.includeMenu,
          emojiEnabled: data.emojiEnabled,
          smartGreetingEnabled: data.smartGreetingEnabled,
          fuzzyGreetingEnabled: data.fuzzyGreetingEnabled,
          semanticGreetingEnabled: data.semanticGreetingEnabled,
          stripGreetingFromQuestion: data.stripGreetingFromQuestion,
          greetingSimilarityThreshold: data.greetingSimilarityThreshold.toFixed(4),
          greetingModifiers: data.greetingModifiers,
          menuMode: data.menuMode,
          popularPeriodDays: data.popularPeriodDays,
          menuLimit: data.menuLimit,
          menuFinalLabel: data.menuFinalLabel || null,
          similarityEnabled: data.similarityEnabled,
          similarityHigh: data.similarityHigh.toFixed(4),
          similarityMedium: data.similarityMedium.toFixed(4),
          similaritySuggestionEnabled: data.similaritySuggestionEnabled,
          similarityMaxSuggestions: data.similarityMaxSuggestions,
          notFoundMessage: data.notFoundMessage,
          showSuggestionsOnNotFound: data.showSuggestionsOnNotFound,
          showMenuOnNotFound: data.showMenuOnNotFound,
          status: data.status,
          maintenanceMessage: data.maintenanceMessage,
          humanHandoffEnabled: data.humanHandoffEnabled,
          humanHandoffMessage: data.humanHandoffMessage,
          humanHandoffUrl: data.humanHandoffUrl || null,
          humanHandoffPhone: data.humanHandoffPhone || null,
          humanHandoffAfterUnanswered: data.humanHandoffAfterUnanswered,
          answerStyle: data.answerStyle,
          answerTone: data.answerTone,
          updatedBy: user.id,
          updatedAt: new Date(),
        },
      });

    await tx.delete(botMessageRules);
    if (rules.length > 0) {
      await tx.insert(botMessageRules).values(
        rules.map((rule) => ({
          type: rule.type,
          phrase: rule.phrase,
          normalizedPhrase: rule.normalizedPhrase,
          reply: rule.reply || null,
          isActive: rule.isActive,
          sortOrder: rule.sortOrder,
        })),
      );
    }
  });

  await logAudit({
    user,
    action: "UPDATE",
    entity: "BOT_SETTINGS",
    oldData: old ? { menuMode: old.menuMode, status: old.status } : null,
    newData: { menuMode: data.menuMode, status: data.status, rules: rules.length },
  });
  revalidatePath("/bot-settings");
  revalidatePath("/analytics");
  return ok("Pengaturan bot PMB berhasil disimpan.");
}
