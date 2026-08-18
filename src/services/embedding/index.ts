import { getEmbeddingConfig } from "@/lib/env";
import { HashEmbeddingProvider } from "./hash";
import { OpenAICompatibleEmbeddingProvider } from "./openai-compatible";
import type { EmbeddingProvider } from "./provider";

let cached: EmbeddingProvider | null = null;

/**
 * Factory provider embedding berdasarkan `EMBEDDING_PROVIDER`.
 * Memakai cache modul (singleton) karena instance menyimpan config.
 */
export function getEmbeddingProvider(): EmbeddingProvider {
  if (cached) return cached;

  const { provider, baseUrl, apiKey, model, dimension } = getEmbeddingConfig();

  switch (provider) {
    case "openai-compatible":
      cached = new OpenAICompatibleEmbeddingProvider({
        baseUrl,
        model,
        dimension,
        apiKey: apiKey || undefined,
      });
      break;
    case "hash":
    default:
      cached = new HashEmbeddingProvider(dimension, `hash-${model}`);
      break;
  }

  return cached;
}

/** Kembalikan instance baru (dipakai di test / setelah env berubah). */
export function resetEmbeddingProvider(): void {
  cached = null;
}
