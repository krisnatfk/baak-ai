import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  settings: vi.fn(),
  menu: vi.fn(),
  log: vi.fn(),
}));

vi.mock("@/lib/server/bot-settings", () => ({ getBotSettings: mocks.settings }));
vi.mock("@/services/bot/menu", () => ({
  getBotMenu: mocks.menu,
  formatMenuText: (items: Array<{ number: number; question: string }>) =>
    items.map((item) => `${item.number}. ${item.question}`).join("\n"),
}));
vi.mock("@/services/bot/analytics", () => ({ logBotEventBestEffort: mocks.log }));

import { resolveBotMessage } from "./resolver";

const settings = {
  botName: "Asisten PMB", institutionName: "Teknokrat", userCallName: "Kak",
  welcomeEnabled: true, welcomeIntro: "Selamat datang", welcomeClosing: "Silakan pilih", includeMenu: true, emojiEnabled: true,
  smartGreetingEnabled: true, fuzzyGreetingEnabled: true, semanticGreetingEnabled: false, stripGreetingFromQuestion: true,
  greetingSimilarityThreshold: 0.8, greetingModifiers: "kak,kaka,min,admin,mimin,mas,mba,mbak,pak,bu,bro,gan",
  menuMode: "MANUAL" as const, popularPeriodDays: 30, menuLimit: 10, menuFinalLabel: "",
  similarityEnabled: true, similarityHigh: 0.7, similarityMedium: 0.55, similaritySuggestionEnabled: true, similarityMaxSuggestions: 5,
  notFoundMessage: "Tidak ditemukan", showSuggestionsOnNotFound: true, showMenuOnNotFound: true,
  status: "ACTIVE" as const, maintenanceMessage: "Maintenance", humanHandoffEnabled: true, humanHandoffMessage: "", humanHandoffUrl: "", humanHandoffPhone: "", humanHandoffAfterUnanswered: 1,
  answerStyle: "NORMAL" as const, answerTone: "RAMAH_PMB" as const,
  rules: [
    { type: "GREETING" as const, phrase: "halo", reply: "Halo Kak", isActive: true },
    { type: "GREETING" as const, phrase: "hallo", reply: "Halo Kak", isActive: true },
    { type: "GREETING" as const, phrase: "assalamualaikum", reply: "Waalaikumsalam Kak", isActive: true },
    { type: "GREETING" as const, phrase: "selamat pagi", reply: "Selamat pagi Kak", isActive: true },
    { type: "GREETING" as const, phrase: "permisi", reply: "", isActive: true },
    { type: "NOISE" as const, phrase: "p", reply: "", isActive: true },
    { type: "NOISE" as const, phrase: "....", reply: "", isActive: true },
  ],
};

const menuItem = {
  id: "faq-1", faqId: "faq-1", number: 1, question: "Berapa biaya kuliah?", answer: "Jawaban", menuOrder: 1, source: "MANUAL" as const,
  sources: [], media: [], attachments: [],
};

describe("resolveBotMessage", () => {
  beforeEach(() => {
    mocks.settings.mockResolvedValue(settings);
    mocks.menu.mockResolvedValue({ mode: "MANUAL", items: [menuItem] });
    mocks.log.mockResolvedValue(undefined);
  });

  it.each(["halo", "hallo", "assalamualaikum", "p", "...."])("%s menjadi WELCOME", async (message) => {
    expect(await resolveBotMessage(message)).toMatchObject({ route: "WELCOME", ragQuery: null });
  });

  it.each([
    "assalamualaikum kak",
    "Assalamualaikum, Kak 👋",
    "assalamu alaikum min",
    "asalamualaikum",
    "assalamualaikum wr wb",
    "halo kak",
    "hallo min",
    "selamat pagi kak",
    "permisi admin",
  ])("smart greeting %s menjadi WELCOME", async (message) => {
    expect(await resolveBotMessage(message)).toMatchObject({
      route: "WELCOME",
      reason: "GREETING",
      ragQuery: null,
    });
  });

  it.each(["biaya?", "beasiswa?", "syarat?", "daftar?", "prodi?", "berapa biaya kuliah?", "gedung b dimana?"])("%s tetap QUESTION", async (message) => {
    expect(await resolveBotMessage(message)).toMatchObject({ route: "QUESTION", ragQuery: message });
  });

  it.each([
    ["assalamualaikum kak, berapa biaya kuliah?", "berapa biaya kuliah?"],
    ["halo min kapan pendaftaran dibuka?", "kapan pendaftaran dibuka?"],
    ["selamat pagi kak, apakah ada beasiswa?", "apakah ada beasiswa?"],
  ])("greeting pada pertanyaan %s dipotong untuk RAG", async (message, ragQuery) => {
    expect(await resolveBotMessage(message)).toMatchObject({
      route: "QUESTION",
      reason: "GREETING_WITH_QUESTION",
      ragQuery,
    });
  });

  it("nomor menu valid menjadi MENU dan membawa FAQ", async () => {
    expect(await resolveBotMessage("1")).toMatchObject({
      route: "MENU",
      ragQuery: "Berapa biaya kuliah?",
      resolvedMenuItem: { number: 1, faqId: "faq-1" },
    });
  });

  it("nomor menu tidak valid aman menjadi QUESTION", async () => {
    expect(await resolveBotMessage("999")).toMatchObject({ route: "QUESTION", resolvedMenuItem: null });
  });

  it("status maintenance mengembalikan pesan maintenance", async () => {
    mocks.settings.mockResolvedValue({ ...settings, status: "MAINTENANCE" });
    expect(await resolveBotMessage("biaya?")).toMatchObject({ route: "WELCOME", reason: "MAINTENANCE", responseText: "Maintenance" });
  });

  it("tidak menggandakan greeting specific reply dan baris pembuka welcome", async () => {
    mocks.settings.mockResolvedValue({ ...settings, welcomeIntro: "Halo Kak 👋\nInformasi PMB" });
    const response = await resolveBotMessage("halo kak");
    expect(response.responseText?.match(/Halo Kak/g)).toHaveLength(1);
    expect(response.responseText).toContain("Informasi PMB");
  });
});
