/**
 * Abstraksi provider embedding.
 *
 * Sistem ini TIDAK bergantung pada OpenAI/Gemini. Provider di-pilih lewat
 * env `EMBEDDING_PROVIDER`:
 *  - "openai-compatible" → provider LLM lokal (Ollama, LM Studio, vLLM, dst.)
 *    yang menyediakan endpoint `/v1/embeddings` dengan protokol yang sama.
 *  - "hash"              → fallback deterministik untuk development/CI tanpa
 *    model embedding (HANYA untuk dev, ditolak dengan warning di production).
 */

export interface EmbeddingProvider {
  /** Dimensi vektor yang dihasilkan provider. */
  readonly dimension: number;
  /** Nama model (diisi ke kolom `embedding_model` untuk audit). */
  readonly model: string;
  /** Embed banyak teks sekaligus. Wajib mengembalikan array sepanjang `texts`. */
  embedTexts(texts: string[]): Promise<number[][]>;
  /** Embed satu teks. */
  embed(text: string): Promise<number[]>;
}
