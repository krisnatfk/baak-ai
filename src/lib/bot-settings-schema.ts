import { z } from "zod";

export const BOT_MENU_MODES = ["MANUAL", "POPULAR", "HYBRID"] as const;
export const BOT_STATUSES = ["ACTIVE", "MAINTENANCE", "LIMITED"] as const;
export const BOT_ANSWER_STYLES = ["SINGKAT", "NORMAL", "LENGKAP"] as const;
export const BOT_RULE_TYPES = ["GREETING", "NOISE"] as const;

export const botMessageRuleInputSchema = z.object({
  id: z.string().uuid().optional(),
  type: z.enum(BOT_RULE_TYPES),
  phrase: z.string().trim().min(1).max(255),
  reply: z.string().trim().max(4000).default(""),
  isActive: z.boolean().default(true),
});

export const botSettingsInputSchema = z
  .object({
    botName: z.string().trim().min(2).max(150),
    institutionName: z.string().trim().min(2).max(255),
    userCallName: z.string().trim().min(1).max(50),
    welcomeEnabled: z.boolean(),
    welcomeIntro: z.string().trim().min(1).max(8000),
    welcomeClosing: z.string().trim().max(4000),
    includeMenu: z.boolean(),
    emojiEnabled: z.boolean(),
    smartGreetingEnabled: z.boolean(),
    fuzzyGreetingEnabled: z.boolean(),
    semanticGreetingEnabled: z.boolean(),
    stripGreetingFromQuestion: z.boolean(),
    greetingSimilarityThreshold: z.number().min(0.5).max(1),
    greetingModifiers: z.string().trim().min(1).max(1000),
    menuMode: z.enum(BOT_MENU_MODES),
    popularPeriodDays: z.number().int().min(1).max(365),
    menuLimit: z.number().int().min(1).max(30),
    menuFinalLabel: z.string().trim().max(255),
    similarityEnabled: z.boolean(),
    similarityHigh: z.number().min(0).max(1),
    similarityMedium: z.number().min(0).max(1),
    similaritySuggestionEnabled: z.boolean(),
    similarityMaxSuggestions: z.number().int().min(0).max(10),
    notFoundMessage: z.string().trim().min(1).max(8000),
    showSuggestionsOnNotFound: z.boolean(),
    showMenuOnNotFound: z.boolean(),
    status: z.enum(BOT_STATUSES),
    maintenanceMessage: z.string().trim().min(1).max(8000),
    humanHandoffEnabled: z.boolean(),
    humanHandoffMessage: z.string().trim().max(8000),
    humanHandoffUrl: z.union([z.string().trim().url(), z.literal("")]),
    humanHandoffPhone: z.string().trim().max(50),
    humanHandoffAfterUnanswered: z.number().int().min(1).max(100),
    answerStyle: z.enum(BOT_ANSWER_STYLES),
    answerTone: z.literal("RAMAH_PMB"),
    rules: z.array(botMessageRuleInputSchema).max(100),
  })
  .refine((value) => value.similarityHigh >= value.similarityMedium, {
    path: ["similarityHigh"],
    message: "Threshold HIGH harus lebih besar atau sama dengan MEDIUM.",
  });

export type BotSettingsInput = z.infer<typeof botSettingsInputSchema>;
export type BotMessageRuleInput = z.infer<typeof botMessageRuleInputSchema>;
