import { describe, expect, it } from "vitest";
import { HashEmbeddingProvider } from "./hash";

const DIM = 128;

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

function norm(v: number[]): number {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0));
}

describe("HashEmbeddingProvider", () => {
  const provider = new HashEmbeddingProvider(DIM);

  it("mengembalikan vektor dengan dimensi yang diminta", async () => {
    const vec = await provider.embed("berapa biaya herregistrasi?");
    expect(vec).toHaveLength(DIM);
  });

  it("deterministik — input sama menghasilkan vektor sama", async () => {
    const a = await provider.embed("jadwal sidang skripsi 2024");
    const b = await provider.embed("jadwal sidang skripsi 2024");
    expect(a).toEqual(b);
  });

  it("memproduksi vektor ternormalisasi (norm L2 ≈ 1)", async () => {
    const vec = await provider.embed("formulir pendaftaran cuti");
    expect(norm(vec)).toBeCloseTo(1, 5);
  });

  it("embedTexts mengembalikan jumlah embedding sesuai input", async () => {
    const texts = ["a", "b", "c"];
    const vecs = await provider.embedTexts(texts);
    expect(vecs).toHaveLength(3);
    vecs.forEach((v) => expect(v).toHaveLength(DIM));
  });

  it("embedTexts konsisten dengan embed per item", async () => {
    const texts = ["cuti semester", "pengajuan skripsi"];
    const [batch0] = await provider.embedTexts(texts);
    const single = await provider.embed(texts[0]);
    expect(batch0).toEqual(single);
  });

  it("teks serupa (berbagi token) lebih dekat dari teks berbeda", async () => {
    const base = await provider.embed("jadwal sidang skripsi");
    const similar = await provider.embed("sidang skripsi jadwal");
    const unrelated = await provider.embed("biaya kuliah semester");
    expect(cosine(base, similar)).toBeGreaterThan(cosine(base, unrelated));
  });

  it("model default hash-v1 dan dimensi bisa diubah", () => {
    const p = new HashEmbeddingProvider(64, "hash-custom");
    expect(p.model).toBe("hash-custom");
    expect(p.dimension).toBe(64);
  });
});
