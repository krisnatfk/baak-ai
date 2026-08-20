import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sourceRows: [] as Array<{ knowledgeId: string; title: string; url: string | null }>,
  related: vi.fn(),
  item: vi.fn(),
  items: vi.fn(),
  media: vi.fn(),
  attachments: vi.fn(),
  fileUrlFromPath: vi.fn(),
}));

vi.mock("@/lib/server/media-upload", () => ({
  fileUrlFromPath: mocks.fileUrlFromPath,
}));

vi.mock("@/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ orderBy: async () => mocks.sourceRows }),
      }),
    }),
    query: {
      knowledgeRelatedQuestions: { findMany: mocks.related },
      knowledgeItems: { findFirst: mocks.item, findMany: mocks.items },
      knowledgeMedia: { findMany: mocks.media },
      knowledgeAttachments: { findMany: mocks.attachments },
    },
  },
}));

import { buildRagAnswer } from "./answer";
import type { SearchResult } from "./search";

describe("buildRagAnswer top-result-only", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    mocks.sourceRows = [
      { knowledgeId: "faq-a", title: "Informasi Biaya", url: "https://example.com/biaya" },
      { knowledgeId: "faq-b", title: "Informasi Pendaftaran", url: "https://example.com/pendaftaran" },
    ];
    mocks.related.mockResolvedValue([]);
    mocks.item.mockResolvedValue({ id: "faq-a", categoryId: null });
    mocks.items.mockResolvedValue([]);
    mocks.fileUrlFromPath.mockImplementation(async (filePath: string | null) =>
      filePath?.includes("exists")
        ? `http://host.docker.internal:3010/api/files/${filePath.split("/").at(-1)}`
        : null,
    );
    mocks.media.mockResolvedValue([
      { id: "media-external", type: "IMAGE", caption: "Biaya", url: "https://example.com/image-a.jpg", filePath: null },
    ]);
    mocks.attachments.mockResolvedValue([
      { id: "attachment-external", title: "Biaya", type: "PDF", fileName: "biaya.pdf", fileSize: 100, mimeType: "application/pdf", filePath: null, url: "https://example.com/biaya.pdf" },
    ]);
  });

  it("hanya mengembalikan source, media, dan attachment milik FAQ teratas", async () => {
    const results: SearchResult[] = [
      { id: "faq-a", type: "FAQ", question: "Berapa biaya kuliah?", answer: "Jawaban A", category: "Biaya", source: null, url: null, score: 0.9 },
      { id: "faq-b", type: "FAQ", question: "Bagaimana mendaftar?", answer: "Jawaban B", category: "Pendaftaran", source: null, url: "https://example.com/pendaftaran", score: 0.7 },
    ];

    const answer = await buildRagAnswer(results);

    expect(answer.sources.map((source) => source.url)).toEqual([null, "https://example.com/biaya"]);
    expect(answer.media.map((media) => media.url)).toEqual(["https://example.com/image-a.jpg"]);
    expect(answer.attachments.map((file) => file.url)).toEqual(["https://example.com/biaya.pdf"]);
    expect(answer.sources.some((source) => source.url?.includes("pendaftaran"))).toBe(false);
  });

  it("mengosongkan semua enrichment saat skor top di bawah threshold", async () => {
    const result: SearchResult = { id: "faq-a", type: "FAQ", question: "Harga tiket konser", answer: "", category: null, source: null, url: null, score: 0.1 };
    await expect(buildRagAnswer([result])).resolves.toEqual({
      sources: [], suggestions: [], media: [], attachments: [],
    });
  });

  it("menyertakan local/external media yang valid dan mengabaikan local media missing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.media.mockResolvedValue([
      { id: "media-ok", type: "IMAGE", caption: "Ada", url: null, filePath: "uploads/media-exists.png" },
      { id: "media-missing", type: "IMAGE", caption: "Hilang", url: null, filePath: "uploads/media-missing.png" },
      { id: "media-url", type: "VIDEO", caption: "External", url: "https://example.com/video", filePath: null },
    ]);

    const answer = await buildRagAnswer([
      { id: "faq-a", type: "FAQ", question: "FAQ valid", answer: "Jawaban tetap ada", category: null, source: null, url: null, score: 0.9 },
    ]);

    expect(answer.media.map((item) => item.url)).toEqual([
      "http://host.docker.internal:3010/api/files/media-exists.png",
      "https://example.com/video",
    ]);
    expect(answer.sources).not.toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[RAG_ASSET_MISSING]"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"mediaId":"media-missing"'));
  });

  it("menyertakan local/external attachment valid dan tidak gagal karena local missing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.attachments.mockResolvedValue([
      { id: "attachment-ok", title: "Ada", type: "PDF", fileName: "exists.pdf", fileSize: 10, mimeType: "application/pdf", filePath: "uploads/attachment-exists.pdf", url: null },
      { id: "attachment-missing", title: "Hilang", type: "PDF", fileName: "missing.pdf", fileSize: 10, mimeType: "application/pdf", filePath: "uploads/attachment-missing.pdf", url: null },
      { id: "attachment-url", title: "External", type: "PDF", fileName: "external.pdf", fileSize: 0, mimeType: "application/pdf", filePath: null, url: "https://example.com/external.pdf" },
    ]);

    await expect(buildRagAnswer([
      { id: "faq-a", type: "FAQ", question: "FAQ valid", answer: "Jawaban tetap ada", category: null, source: null, url: null, score: 0.9 },
    ])).resolves.toMatchObject({
      attachments: [
        { url: "http://host.docker.internal:3010/api/files/attachment-exists.pdf" },
        { url: "https://example.com/external.pdf" },
      ],
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"attachmentId":"attachment-missing"'));
  });

  it("fallback ke URL eksternal bila local file missing", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.media.mockResolvedValue([
      { id: "media-fallback", type: "IMAGE", caption: null, url: "https://example.com/fallback.jpg", filePath: "uploads/media-missing.jpg" },
    ]);
    mocks.attachments.mockResolvedValue([
      { id: "attachment-fallback", title: "Fallback", type: "PDF", fileName: "fallback.pdf", fileSize: 0, mimeType: "application/pdf", filePath: "uploads/attachment-missing.pdf", url: "https://example.com/fallback.pdf" },
    ]);

    const answer = await buildRagAnswer([
      { id: "faq-a", type: "FAQ", question: "FAQ", answer: "Jawaban", category: null, source: null, url: null, score: 0.9 },
    ]);
    expect(answer.media[0]?.url).toBe("https://example.com/fallback.jpg");
    expect(answer.attachments[0]?.url).toBe("https://example.com/fallback.pdf");
  });

  it("suggestions hanya memakai kandidat semantic, dedupe, dan menyertakan score", async () => {
    const answer = await buildRagAnswer([
      { id: "faq-a", type: "FAQ", question: "Biaya kuliah?", answer: "A", score: 0.8 },
      { id: "faq-b", type: "FAQ", question: "Biaya pendaftaran?", answer: "B", score: 0.54 },
      { id: "faq-c", type: "FAQ", question: "Biaya pendaftaran?", answer: "C", score: 0.5 },
      { id: "chunk-a", type: "CHUNK", answer: "Dokumen", score: 0.49 },
    ], { thresholdMedium: 0.55, maxSuggestions: 3 });
    expect(answer.suggestions).toEqual([
      { id: "faq-b", faqId: "faq-b", question: "Biaya pendaftaran?", score: 0.54 },
    ]);
  });
});
