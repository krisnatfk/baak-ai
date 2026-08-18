/**
 * Klien LLM (chat completion) openai-compatible — server-only.
 *
 * Dipakai oleh "Generate FAQ dari dokumen". Menghubungi endpoint
 * `POST {LLM_BASE_URL}/chat/completions` (Ollama / vLLM / LM Studio / LocalAI)
 * memakai `fetch` bawaan — TIDAK mengimpor SDK vendor apa pun.
 *
 * Konfigurasi dibaca dari `getLlmConfig()` (LLM_BASE_URL, LLM_MODEL,
 * LLM_API_KEY opsional, LLM_TEMPERATURE). API key tidak pernah di-log.
 */

import { getLlmConfig } from "@/lib/env";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionOptions {
  messages: ChatMessage[];
  /** Temperatur (0..2). Default dari LLM_TEMPERATURE. */
  temperature?: number;
  /** Minta model mengeluarkan JSON (diparse dari respons). */
  json?: boolean;
  /** Token maksimum respons. */
  maxTokens?: number;
}

/** Error bisnis LLM (pesan siap ditampilkan ke admin). */
export class LlmError extends Error {}

/**
 * Panggil chat completion dan kembalikan teks kontennya.
 * Melempar LlmError dengan pesan aman (tanpa kredensial).
 */
export async function chatCompletion(
  options: ChatCompletionOptions,
): Promise<string> {
  const config = getLlmConfig();

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (config.apiKey) headers["authorization"] = `Bearer ${config.apiKey}`;

  const body: Record<string, unknown> = {
    model: config.model,
    messages: options.messages,
    temperature: options.temperature ?? config.temperature,
    stream: false,
  };
  if (options.maxTokens) body["max_tokens"] = options.maxTokens;
  if (options.json) {
    // Ollama & kebanyakan backend openai-compatible menerima response_format.
    body["response_format"] = { type: "json_object" };
    // Beberapa versi Ollama memakai `format`. Kirim keduanya (harmless).
    body["format"] = "json";
  }

  let res: Response;
  try {
    res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new LlmError(
      `Gagal menghubungi server LLM (${config.baseUrl}): ${(err as Error).message}`,
    );
  }

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new LlmError(
      `Server LLM mengembalikan ${res.status}: ${detail || "tanpa detail"}`,
    );
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new LlmError("Respon LLM bukan JSON yang valid.");
  }

  const content = extractContent(json);
  if (!content) throw new LlmError("Respon LLM kosong.");
  return content;
}

/** Ekstrak teks konten dari berbagai bentuk respons openai-compatible. */
function extractContent(payload: unknown): string {
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    const choices = obj.choices;
    if (Array.isArray(choices) && choices.length > 0) {
      const first = choices[0] as Record<string, unknown>;
      const message = first.message;
      if (message && typeof message === "object") {
        const content = (message as Record<string, unknown>).content;
        if (typeof content === "string") return content;
        // Bentuk array (beberapa backend) — gabungkan bagian teks.
        if (Array.isArray(content)) {
          return content
            .map((part) =>
              typeof part === "object" && part !== null
                ? String((part as Record<string, unknown>).text ?? "")
                : String(part),
            )
            .join("");
        }
      }
    }
  }
  return "";
}

/**
 * Panggil chat completion dan parse hasilnya sebagai JSON objek.
 * Coba beberapa strategi ekstraksi agar tahan terhadap model yang menyisipkan
 * teks sebelum/sesudah blok JSON.
 */
export async function chatCompletionJson<T>(
  options: ChatCompletionOptions,
): Promise<T> {
  const content = await chatCompletion({ ...options, json: true });
  return parseJsonRobust<T>(content);
}

/** Parse JSON dari teks model (toleran terhadap prolog/epilog non-JSON). */
export function parseJsonRobust<T>(text: string): T {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // Fallback: ambil blok pertama `{...}` atau `[...]` terluar.
    const firstBrace = trimmed.indexOf("{");
    const firstBracket = trimmed.indexOf("[");
    const start =
      firstBrace === -1
        ? firstBracket
        : firstBracket === -1
          ? firstBrace
          : Math.min(firstBrace, firstBracket);
    if (start === -1) {
      throw new LlmError("Respon LLM tidak memuat JSON yang valid.");
    }
    const open = trimmed[start];
    const close = open === "{" ? "}" : "]";
    const end = trimmed.lastIndexOf(close);
    if (end <= start) {
      throw new LlmError("Respon LLM tidak memuat JSON yang valid.");
    }
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as T;
    } catch {
      throw new LlmError("Respon LLM tidak memuat JSON yang valid.");
    }
  }
}
