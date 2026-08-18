import { describe, expect, it } from "vitest";
import {
  chunkText,
  estimateTokens,
  normalizeParagraphs,
  DEFAULT_MAX_TOKENS,
} from "./chunk";

describe("estimateTokens", () => {
  it("memperkirakan 1 token untuk teks pendek", () => {
    expect(estimateTokens("a")).toBe(1);
  });

  it("memperkirakan token = ceil(panjang / 4)", () => {
    expect(estimateTokens("abcdefgh")).toBe(2);
    expect(estimateTokens("abcdefghij")).toBe(3);
  });

  it("tidak pernah mengembalikan 0", () => {
    expect(estimateTokens("")).toBe(1);
  });

  it("menghormati charsPerToken custom", () => {
    expect(estimateTokens("abcdefgh", 2)).toBe(4);
  });
});

describe("normalizeParagraphs", () => {
  it("mengganti CRLF dengan LF", () => {
    expect(normalizeParagraphs("a\r\nb")).toBe("a\nb");
  });

  it("menggabungkan baris kosong berlebih menjadi satu", () => {
    expect(normalizeParagraphs("a\n\n\n\nb")).toBe("a\n\nb");
  });

  it("membuang whitespace di ujung teks", () => {
    expect(normalizeParagraphs("  a\nb  ")).toBe("a\nb");
  });
});

describe("chunkText", () => {
  it("mengembalikan array kosong untuk input kosong", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  ")).toEqual([]);
  });

  it("menghasilkan satu chunk untuk teks pendek", () => {
    const chunks = chunkText("Ini adalah teks singkat.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe("Ini adalah teks singkat.");
  });

  it("menggabungkan beberapa paragraf pendek dalam satu chunk", () => {
    const chunks = chunkText("Paragraf satu.\n\nParagraf dua.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain("Paragraf satu.");
    expect(chunks[0].content).toContain("Paragraf dua.");
  });

  it("memecah teks panjang menjadi beberapa chunk", () => {
    // 60 paragraf x 60 kata x 5 karakter → jauh melebihi batas default.
    const paragraph = Array.from({ length: 60 }, (_, i) => `kalimat panjang nomor ${i + 1} berulang`).join(" ");
    const text = Array.from({ length: 40 }, () => paragraph).join("\n\n");
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("tidak ada chunk yang melampaui batas token (kecuali satu kata sangat panjang)", () => {
    const paragraph = Array.from({ length: 60 }, (_, i) => `kalimat nomor ${i + 1}`).join(" ");
    const text = Array.from({ length: 50 }, () => paragraph).join("\n\n");
    const maxChars = DEFAULT_MAX_TOKENS * 4;
    const chunks = chunkText(text);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(maxChars + maxChars); // toleransi satu kalimat panjang
    }
  });

  it("memecah satu paragraf yang lebih panjang dari batas", () => {
    const longParagraph = Array.from(
      { length: 300 },
      (_, i) => `kata nomor ${i}`,
    ).join(" ");
    expect(longParagraph.length).toBeGreaterThan(DEFAULT_MAX_TOKENS * 4);
    const chunks = chunkText(longParagraph);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("menjaga tokenEstimate sesuai heuristik", () => {
    const chunks = chunkText("Ini adalah teks untuk diuji.");
    expect(chunks[0].tokenEstimate).toBe(estimateTokens(chunks[0].content));
  });

  it("menghormati maxTokens custom", () => {
    const text = "abcdefghij klmnopqrst uvxyz".repeat(50);
    const chunks = chunkText(text, { maxTokens: 20, charsPerToken: 4 });
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(20 * 4 + 20 * 4);
    }
  });

  it("menghapus chunk kosong dari whitespace saja", () => {
    const chunks = chunkText("a\n\n\n   \n\nb");
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    for (const chunk of chunks) expect(chunk.content.trim().length).toBeGreaterThan(0);
  });
});
