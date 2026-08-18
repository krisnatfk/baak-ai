import { createHash } from "node:crypto";
import type { EmbeddingProvider } from "./provider";

/**
 * Provider embedding deterministik berbasis hash — fallback development.
 *
 * Mengubah token teks menjadi vektor deterministik (Feature Hashing bersign).
 * Tidak menghasilkan representasi semantik; HANYA dipakai supaya pipeline RAG
 * (embed → simpan → cari → skor) bisa diuji tanpa model lokal. Di production,
 * env loader menampilkan warning bila provider ini aktif.
 */
export class HashEmbeddingProvider implements EmbeddingProvider {
  readonly dimension: number;
  readonly model: string;

  constructor(dimension: number, model = "hash-v1") {
    this.dimension = dimension;
    this.model = model;
  }

  embedTexts(texts: string[]): Promise<number[][]> {
    return Promise.resolve(texts.map((t) => this.embedOne(t)));
  }

  embed(text: string): Promise<number[]> {
    return Promise.resolve(this.embedOne(text));
  }

  private embedOne(text: string): number[] {
    const vec = new Array<number>(this.dimension).fill(0);
    const tokens = this.tokenize(text);

    for (const token of tokens) {
      const idx = this.hashIndex(token);
      vec[idx] += this.hashSign(token);
    }

    // Normalisasi L2 supaya cosine similarity di pgvector berperilaku baik.
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map((v) => v / norm);
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/\p{Emoji_Presentation}/gu, " ")
      .replace(/[^a-z0-9_\s]+/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2);
  }

  private hashIndex(token: string): number {
    return this.hash(token) % this.dimension;
  }

  private hashSign(token: string): number {
    return this.hash(`s:${token}`) % 2 === 0 ? 1 : -1;
  }

  private hash(token: string): number {
    const digest = createHash("sha256").update(token).digest();
    return digest.readUInt32BE(0);
  }
}
