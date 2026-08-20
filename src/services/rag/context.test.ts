import { describe, expect, it } from "vitest";
import { buildRagContext } from "./context";
import type { SearchResult } from "./search";

function faq(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: "faq-1",
    type: "FAQ",
    question: "Bagaimana cara mendaftar di Universitas Teknokrat Indonesia?",
    answer: "Daftar melalui portal https://spmb.teknokrat.ac.id.",
    category: "Pendaftaran",
    source: "SPMB Universitas Teknokrat Indonesia",
    url: "https://spmb.teknokrat.ac.id",
    score: 0.82,
    ...overrides,
  };
}

function chunk(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: "chunk-1",
    type: "CHUNK",
    answer: "Persyaratan pendaftaran dijelaskan pada pedoman PMB.",
    source: "Pedoman PMB 2026",
    url: "https://spmb.teknokrat.ac.id/pedoman",
    score: 0.6,
    ...overrides,
  };
}

describe("buildRagContext", () => {
  it("memuat blok sumber, pertanyaan, dan aturan anti-halusinasi PMB", () => {
    const context = buildRagContext([faq(), chunk()]);
    expect(context).toContain("Sumber 1:");
    expect(context).toContain("[FAQ] Bagaimana cara mendaftar di Universitas Teknokrat Indonesia?");
    expect(context).toContain("Sumber 2:");
    expect(context).toContain("[Dokumen] Pedoman PMB 2026");
    expect(context).toContain("=== KNOWLEDGE BASE ===");
    expect(context).toContain("=== AKHIR KNOWLEDGE BASE ===");
    expect(context).toContain("HANYA informasi yang terdapat pada KNOWLEDGE BASE");
    expect(context).toContain("Penerimaan Mahasiswa Baru (PMB) Universitas Teknokrat Indonesia");
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

  it("aturan mengarahkan ke panitia PMB / admin Teknokrat", () => {
    const context = buildRagContext([faq()]);
    expect(context).toContain("panitia PMB / admin Universitas Teknokrat Indonesia");
  });

  it("melarang AI membuat greeting utama sendiri", () => {
    const context = buildRagContext([faq()]);
    expect(context).toContain("Tulis hanya isi jawaban");
    expect(context).toContain("JANGAN membuka dengan salam atau greeting");
    expect(context).toContain("Sistem akan menambahkan greeting yang sesuai");
  });

  it("memberi tahu model saat aset relevan akan dikirim setelah jawaban", () => {
    const context = buildRagContext(
      [faq({ answer: "Silakan cek brosur di bawah ini." })],
      {
        media: [{ caption: "Brosur Gelombang 2" }],
        attachments: [
          { title: "Jadwal PMB", fileName: "jadwal-pmb.pdf" },
        ],
      },
    );

    expect(context).toContain("=== ASET TERLAMPIR ===");
    expect(context).toContain("Gambar 1: Brosur Gelombang 2");
    expect(context).toContain("Lampiran 1: Jadwal PMB (jadwal-pmb.pdf)");
    expect(context).toContain("JANGAN mengatakan informasi tidak tersedia");
    expect(context).not.toContain("/api/files/");
  });

  it("tidak menambahkan blok aset bila media dan lampiran kosong", () => {
    const context = buildRagContext([faq()], { media: [], attachments: [] });
    expect(context).not.toContain("=== ASET TERLAMPIR ===");
  });

  it("tidak ada blok hasil → instruksi jangan berasumsi", () => {
    const context = buildRagContext([]);
    expect(context).toContain("jangan berasumsi");
  });
});
