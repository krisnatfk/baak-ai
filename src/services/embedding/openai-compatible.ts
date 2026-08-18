import type { EmbeddingProvider } from "./provider";

/**
 * Provider embedding untuk LLM lokal yang menyediakan endpoint
 * `POST {baseUrl}/embeddings` dengan protokol OpenAI-compatible:
 *
 *   POST {baseUrl}/embeddings
 *   { "model": "bge-m3", "input": ["teks 1", "teks 2"] }
 *   → 200 { "data": [ { "embedding": [0.1, ...], "index": 0 }, ... ] }
 *
 * Cocok untuk Ollama (http://host.docker.internal:11434/v1), LM Studio,
 * vLLM, dan lainnya. API key bersifat opsional; bila diisi dikirim sebagai
 * header `Authorization: Bearer <key>`.
 *
 * Catatan: kelas ini TIDAK mengimpor SDK OpenAI — hanya `fetch` bawaan.
 */
export class OpenAICompatibleEmbeddingProvider implements EmbeddingProvider {
  readonly dimension: number;
  readonly model: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(opts: {
    baseUrl: string;
    model: string;
    dimension: number;
    apiKey?: string;
  }) {
    if (!opts.baseUrl) {
      throw new Error(
        "EMBEDDING_BASE_URL wajib diisi saat EMBEDDING_PROVIDER=openai-compatible.",
      );
    }
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.model = opts.model;
    this.dimension = opts.dimension;
    this.apiKey = opts.apiKey ?? "";
  }

  async embedTexts(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const res = await this.request({
      model: this.model,
      input: texts,
    });

    const data = (res as { data?: unknown }).data;
    if (!Array.isArray(data)) {
      throw new Error("Respon embedding tidak valid: field `data` bukan array.");
    }
    const rows = data as Array<{ embedding?: number[] } | undefined>;
    const embeddings = texts.map((_, i) => rows[i]?.embedding);
    if (embeddings.some((e) => !e || e.length !== this.dimension)) {
      throw new Error(
        `Respon embedding tidak valid: dimensi vektor tidak cocok (harus ${this.dimension}).`,
      );
    }
    return embeddings as number[][];
  }

  async embed(text: string): Promise<number[]> {
    const [vec] = await this.embedTexts([text]);
    return vec;
  }

  private async request(body: unknown): Promise<unknown> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (this.apiKey) {
      headers["authorization"] = `Bearer ${this.apiKey}`;
    }

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/embeddings`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new Error(
        `Gagal menghubungi server embedding di ${this.baseUrl}: ${(err as Error).message}`,
      );
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `Server embedding mengembalikan ${res.status}: ${detail.slice(0, 300)}`,
      );
    }

    return res.json();
  }
}
