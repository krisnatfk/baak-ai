import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ getEmbeddingProvider: vi.fn() }));
vi.mock("@/services/embedding", () => ({ getEmbeddingProvider: mocks.getEmbeddingProvider }));

import { detectDeterministicIntent, detectSemanticGreeting, normalizeIntentMessage } from "./smart-intent";

const rules = [
  { type: "GREETING" as const, phrase: "assalamualaikum", reply: "Waalaikumsalam Kak", isActive: true },
  { type: "GREETING" as const, phrase: "halo", reply: "Halo Kak", isActive: true },
  { type: "GREETING" as const, phrase: "selamat pagi", reply: "", isActive: true },
  { type: "NOISE" as const, phrase: "p", reply: "", isActive: true },
];
const options = {
  enabled: true,
  fuzzyEnabled: true,
  semanticEnabled: true,
  stripGreetingFromQuestion: true,
  similarityThreshold: 0.8,
  modifiers: "kak,min,admin,bro",
};

describe("smart intent normalization", () => {
  it("menormalisasi whitespace, punctuation, apostrophe, dan emoji", () => {
    expect(normalizeIntentMessage("  Assalamu'alaikum, Kak 👋  ")).toBe("assalamualaikum kak");
  });

  it("fuzzy typo aman tetap map ke canonical rule", () => {
    expect(detectDeterministicIntent("haloo kak", rules, options)).toMatchObject({
      intent: "GREETING",
      matchedCanonicalRule: "halo",
      matchMethod: "FUZZY",
    });
  });

  it.each([
    "assalamualaikum",
    "assalamualaikum kak",
    "assalamu alaikum min",
    "asalamualaikum",
    "assalamualaikum wr wb",
  ])("%s dipetakan ke canonical assalamualaikum", (message) => {
    expect(detectDeterministicIntent(message, rules, options)).toMatchObject({
      matchedCanonicalRule: "assalamualaikum",
      matchedRule: expect.objectContaining({ reply: "Waalaikumsalam Kak" }),
    });
  });

  it("menghapus preambule tanya dari query RAG", () => {
    expect(
      detectDeterministicIntent(
        "assalamualaikum kak, saya mau tanya jadwal pmb kapan?",
        rules,
        options,
      ),
    ).toMatchObject({
      intent: "QUESTION",
      greetingWithQuestion: true,
      ragQuery: "jadwal pmb kapan?",
    });
  });

  it("noise punctuation dikenali tanpa mengambil short valid question", () => {
    expect(detectDeterministicIntent("???", rules, options).intent).toBe("NOISE");
    expect(detectDeterministicIntent("biaya?", rules, options).intent).toBe("QUESTION");
  });

  it("semantic fallback memetakan pesan ambigu ke canonical greeting", async () => {
    mocks.getEmbeddingProvider.mockReturnValue({
      embedTexts: vi.fn().mockResolvedValue([
        [1, 0],
        [0.99, 0.01],
        [0, 1],
        [0, 0.5],
      ]),
    });
    await expect(detectSemanticGreeting("salam", rules, 0.8)).resolves.toMatchObject({
      intent: "GREETING",
      matchedCanonicalRule: "assalamualaikum",
      matchMethod: "SEMANTIC",
    });
  });
});
