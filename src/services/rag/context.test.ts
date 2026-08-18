import { describe, expect, it } from "vitest";
import { buildRagContext } from "./context";
import type { SearchResult } from "./search";

function faq(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: "faq-1",
    type: "FAQ",
    question: "Bagaimana cara mendaftar PKL?",
    answer: "Daftar melalui portal akademik.",
    category: "PKL",
    source: null,
    url: null,
    score: 0.82,
    ...overrides,
  };
}

function chunk(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: "chunk-1",
    type: "CHUNK",
    answer: "Persyaratan administratif dijelaskan pada pedoman.",
    source: "Pedoman Akademik 2026",
    url: "https://example.com/pedoman",
    score: 0.6,
    ...overrides,
  };
}

describe("buildRagContext", () => {
  it("memuat blok sumber, pertanyaan, dan aturan anti-halusinasi", () => {
    const context = buildRagContext([faq(), chunk()]);
    expect(context).toContain("Sumber 1:");
    expect(context).toContain("[FAQ] Bagaimana cara mendaftar PKL?");
    expect(context).toContain("Sumber 2:");
    expect(context).toContain("[Dokumen] Pedoman Akademik 2026");
    expect(context).toContain("=== KNOWLEDGE BASE ===");
    expect(context).toContain("=== AKHIR KNOWLEDGE BASE ===");
    expect(context).toContain("HANYA informasi dari blok KNOWLEDGE BASE");
  });

  it("TIDAK mengungkap skor kemiripan ke prompt", () => {
    const context = buildRagContext([faq({ score: 0.9123 }), chunk({ score: 0.5 })]);
    expect(context).not.toContain("0.9123");
    expect(context).not.toContain("skor");
    expect(context).not.toContain("(skor");
  });

  it("TIDAK mengungkap ID internal (UUID/ID FAQ) ke prompt", () => {
    const context = buildRagContext([faq({ id: "550e8400-e29b-41d4-a716-446655440000" })]);
    expect(context).not.toContain("550e8400");
    expect(context).not.toContain("faq-1");
  });

  it("TIDAK memuat disclaimer MEDIUM yang kaku", () => {
    const context = buildRagContext([faq({ score: 0.55 })]);
    expect(context).not.toContain("kecocokan knowledge base untuk pertanyaan ini");
    expect(context).not.toContain("Catatan:");
  });

  it("aturan tidak memaksa arah ke BAAK (hanya bila perlu)", () => {
    const context = buildRagContext([faq()]);
    expect(context).toContain("bila perlu");
  });

  it("tidak ada blok hasil → instruksi jangan berasumsi", () => {
    const context = buildRagContext([]);
    expect(context).toContain("jangan berasumsi");
  });
});
