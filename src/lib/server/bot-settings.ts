import "server-only";

import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { botMessageRules, botSettings } from "@/db/schema";
import type { BotSettingsInput } from "@/lib/bot-settings-schema";

export const DEFAULT_BOT_SETTINGS: BotSettingsInput = {
  botName: "Asisten PMB",
  institutionName: "Universitas Teknokrat Indonesia",
  userCallName: "Kak",
  welcomeEnabled: true,
  welcomeIntro:
    "Halo Kak 👋\nSelamat datang di layanan informasi Penerimaan Mahasiswa Baru\nUniversitas Teknokrat Indonesia 🎓\n\nSaya siap membantu Kakak mencari informasi seputar pendaftaran kuliah.",
  welcomeClosing:
    "Balas dengan nomor pilihan atau langsung tuliskan pertanyaan Kakak ya 😊",
  includeMenu: true,
  emojiEnabled: true,
  smartGreetingEnabled: true,
  fuzzyGreetingEnabled: true,
  semanticGreetingEnabled: true,
  stripGreetingFromQuestion: true,
  greetingSimilarityThreshold: 0.8,
  greetingModifiers: "kak,kaka,min,admin,mimin,mas,mba,mbak,pak,bu,bro,gan",
  menuMode: "MANUAL",
  popularPeriodDays: 30,
  menuLimit: 10,
  menuFinalLabel: "",
  similarityEnabled: true,
  similarityHigh: 0.7,
  similarityMedium: 0.55,
  similaritySuggestionEnabled: true,
  similarityMaxSuggestions: 5,
  notFoundMessage:
    "Maaf Kak, informasi tersebut belum tersedia di database informasi Penerimaan Mahasiswa Baru kami.\n\nKakak bisa mencoba menuliskan pertanyaan dengan kata lain atau memilih informasi yang tersedia pada menu PMB.",
  showSuggestionsOnNotFound: true,
  showMenuOnNotFound: true,
  status: "ACTIVE",
  maintenanceMessage:
    "Mohon maaf Kak, layanan PMB sedang dalam pemeliharaan. Silakan coba kembali beberapa saat lagi.",
  humanHandoffEnabled: true,
  humanHandoffMessage: "",
  humanHandoffUrl: "",
  humanHandoffPhone: "",
  humanHandoffAfterUnanswered: 1,
  answerStyle: "NORMAL",
  answerTone: "RAMAH_PMB",
  rules: [],
};

function numberValue(value: string | number): number {
  return typeof value === "number" ? value : Number(value);
}

export async function getBotSettings(): Promise<BotSettingsInput> {
  // Gunakan query builder biasa untuk tabel control-center. Berbeda dengan
  // db.query.*, ini tidak bergantung pada relational schema yang mungkin masih
  // tersimpan di global cache ketika Next dev melakukan hot reload.
  const [settingsRows, rules] = await Promise.all([
    db.select().from(botSettings).where(eq(botSettings.id, "default")).limit(1),
    db
      .select()
      .from(botMessageRules)
      .orderBy(asc(botMessageRules.sortOrder), asc(botMessageRules.phrase)),
  ]);
  const settings = settingsRows[0];

  if (!settings) return { ...DEFAULT_BOT_SETTINGS, rules: [] };
  return {
    botName: settings.botName,
    institutionName: settings.institutionName,
    userCallName: settings.userCallName,
    welcomeEnabled: settings.welcomeEnabled,
    welcomeIntro: settings.welcomeIntro,
    welcomeClosing: settings.welcomeClosing,
    includeMenu: settings.includeMenu,
    emojiEnabled: settings.emojiEnabled,
    smartGreetingEnabled: settings.smartGreetingEnabled,
    fuzzyGreetingEnabled: settings.fuzzyGreetingEnabled,
    semanticGreetingEnabled: settings.semanticGreetingEnabled,
    stripGreetingFromQuestion: settings.stripGreetingFromQuestion,
    greetingSimilarityThreshold: numberValue(settings.greetingSimilarityThreshold),
    greetingModifiers: settings.greetingModifiers,
    menuMode: settings.menuMode,
    popularPeriodDays: settings.popularPeriodDays,
    menuLimit: settings.menuLimit,
    menuFinalLabel: settings.menuFinalLabel ?? "",
    similarityEnabled: settings.similarityEnabled,
    similarityHigh: numberValue(settings.similarityHigh),
    similarityMedium: numberValue(settings.similarityMedium),
    similaritySuggestionEnabled: settings.similaritySuggestionEnabled,
    similarityMaxSuggestions: settings.similarityMaxSuggestions,
    notFoundMessage: settings.notFoundMessage,
    showSuggestionsOnNotFound: settings.showSuggestionsOnNotFound,
    showMenuOnNotFound: settings.showMenuOnNotFound,
    status: settings.status,
    maintenanceMessage: settings.maintenanceMessage,
    humanHandoffEnabled: settings.humanHandoffEnabled,
    humanHandoffMessage: settings.humanHandoffMessage,
    humanHandoffUrl: settings.humanHandoffUrl ?? "",
    humanHandoffPhone: settings.humanHandoffPhone ?? "",
    humanHandoffAfterUnanswered: settings.humanHandoffAfterUnanswered,
    answerStyle: settings.answerStyle,
    answerTone: "RAMAH_PMB",
    rules: rules.map((rule) => ({
      id: rule.id,
      type: rule.type,
      phrase: rule.phrase,
      reply: rule.reply ?? "",
      isActive: rule.isActive,
    })),
  };
}
