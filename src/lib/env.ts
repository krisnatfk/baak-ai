/**
 * Validasi konfigurasi environment (server-only) — dilakukan SECARA LAZY.
 *
 * Modul ini TIDAK BOLEH di-import dari kode client. Semua secret
 * (DATABASE_URL, AUTH_SECRET, INTERNAL_API_KEY, EMBEDDING_API_KEY, dll)
 * hanya dibaca di sisi server dan tidak pernah dikirim ke bundle client.
 *
 * MENGAPA LAZY?
 * Saat `next build`, Next.js meng-import modul route/page untuk mengumpulkan
 * page data. Jika validasi berjalan eager di modul-level (mis.
 * `required("AUTH_SECRET")`), build gagal — karena secret runtime baru ada
 * saat container berjalan (disuplai lewat docker-compose `env_file`), bukan
 * saat image di-build.
 *
 * Aturan:
 *  - Meng-import modul ini TIDAK boleh melempar error apa pun.
 *  - Setiap getter memvalidasi env saat DIPANGGIL pertama kali (lalu hasilnya
 *    di-cache). Akses pertama hanya terjadi ketika layanan terkait memang
 *    benar-benar dipakai: auth → AUTH_SECRET, internal API → INTERNAL_API_KEY,
 *    database → DATABASE_URL, embedding → konfigurasi embedding, RAG → RAG_*.
 *  - Nilai opsional memakai default yang aman (mis. EMBEDDING_DIMENSION=1024),
 *    sehingga modul yang membaca nilai opsional saat build (skema kolom
 *    vector) tidak gagal.
 */

// Guard runtime bila terlanjur ter-bundle ke client (nilai secret tetap
// tidak akan ter-inline oleh Next.js karena bukan NEXT_PUBLIC_*).
if (typeof window !== "undefined") {
  throw new Error("src/lib/env.ts hanya boleh di-import dari kode server.");
}

function required(name: string, opts: { minLength?: number } = {}): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}. Lihat .env.example.`,
    );
  }
  const min = opts.minLength ?? 0;
  if (min > 0 && value.length < min) {
    throw new Error(
      `Environment variable ${name} harus minimal ${min} karakter (saat ini ${value.length}).`,
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== "" ? value : fallback;
}

function positiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(
      `Environment variable ${name} harus bilangan bulat positif, dapat "${raw}".`,
    );
  }
  return n;
}

function floatBetween(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(
      `Environment variable ${name} harus angka antara ${min} dan ${max}, dapat "${raw}".`,
    );
  }
  return n;
}

// =========================================================
//  Lazy accessors — dipanggil on-demand, hasil di-cache.
// =========================================================

let _appUrl: string | undefined;
/** URL aplikasi yang dipakai NextAuth dll. Tidak membaca secret. */
export function getAppUrl(): string {
  if (!_appUrl) {
    _appUrl = optional("APP_URL", optional("NEXTAUTH_URL", "http://localhost:3001"));
  }
  return _appUrl;
}

let _authSecret: string | undefined;
/** Secret sesi NextAuth. Divalidasi HANYA saat auth benar-benar dipakai. */
export function getAuthSecret(): string {
  if (!_authSecret) {
    _authSecret = required("AUTH_SECRET", { minLength: 32 });
  }
  return _authSecret;
}

let _authMaxAgeSeconds: number | undefined;
// NextAuth v4: maxAge sesi (default 8 jam — lebih pendek dari bawaan 30 hari).
/** Umur sesi JWT (detik). Optional, default 28800. */
export function getAuthMaxAgeSeconds(): number {
  if (_authMaxAgeSeconds === undefined) {
    _authMaxAgeSeconds = positiveInt("AUTH_MAX_AGE_SECONDS", 28800);
  }
  return _authMaxAgeSeconds;
}

let _internalApiKey: string | undefined;
/**
 * Key untuk memanggil /api/rag/* (dipakai n8n). Divalidasi HANYA oleh
 * verifikasi internal API (src/lib/server/internal-auth.ts) — bukan saat
 * import/build.
 */
export function getInternalApiKey(): string {
  if (!_internalApiKey) {
    _internalApiKey = required("INTERNAL_API_KEY", { minLength: 32 });
  }
  return _internalApiKey;
}

let _databaseUrl: string | undefined;
/**
 * Koneksi Postgres. Divalidasi saat database benar-benar dipakai (akses
 * pertama ke db/pool di src/db/client.ts), bukan saat import/build.
 */
export function getDatabaseUrl(): string {
  if (!_databaseUrl) {
    _databaseUrl = required("DATABASE_URL");
  }
  return _databaseUrl;
}

let _embeddingDimension: number | undefined;
/**
 * Dimensi vektor embedding. Dipakai modul-level oleh src/db/schema.ts untuk
 * mendefinisikan kolom `vector(...)`. Aman saat build: hanya membaca nilai
 * opsional (default 1024) — TIDAK memvalidasi provider/key embedding.
 */
export function getEmbeddingDimension(): number {
  if (_embeddingDimension === undefined) {
    _embeddingDimension = positiveInt("EMBEDDING_DIMENSION", 1024);
  }
  return _embeddingDimension;
}

export interface EmbeddingConfig {
  provider: "openai-compatible" | "hash";
  baseUrl: string;
  apiKey: string;
  model: string;
  dimension: number;
  batchSize: number;
}

let _embeddingConfig: EmbeddingConfig | undefined;
/** Konfigurasi lengkap embedding — divalidasi saat service embedding dipakai. */
export function getEmbeddingConfig(): EmbeddingConfig {
  if (!_embeddingConfig) {
    const provider = optional("EMBEDDING_PROVIDER", "hash").toLowerCase();
    if (provider !== "openai-compatible" && provider !== "hash") {
      throw new Error(
        `EMBEDDING_PROVIDER harus "openai-compatible" atau "hash", dapat "${provider}".`,
      );
    }

    if (process.env.NODE_ENV === "production" && provider === "hash") {
      console.warn(
        "[baak-ai] PERINGATAN: EMBEDDING_PROVIDER=hash di production. " +
          "Retrieval semantik TIDAK VALID dengan hash provider — hanya untuk smoke test. " +
          "Gunakan EMBEDDING_PROVIDER=openai-compatible + Ollama/vLLM untuk produksi.",
      );
    }

    _embeddingConfig = {
      provider,
      baseUrl: optional("EMBEDDING_BASE_URL", "").replace(/\/+$/, ""),
      apiKey: process.env.EMBEDDING_API_KEY ?? "",
      model: optional("EMBEDDING_MODEL", "bge-m3"),
      dimension: positiveInt("EMBEDDING_DIMENSION", 1024),
      // Ukuran batch saat memproses antrian embedding.
      batchSize: positiveInt("EMBEDDING_BATCH_SIZE", 10),
    };
  }
  return _embeddingConfig;
}

export interface RagConfig {
  maxResults: number;
  thresholdHigh: number;
  thresholdMedium: number;
  highMargin: number;
  rateLimitPerMinute: number;
}

let _ragConfig: RagConfig | undefined;
/** Konfigurasi RAG — divalidasi saat layanan RAG dipakai (request API / klasifikasi). */
export function getRagConfig(): RagConfig {
  if (!_ragConfig) {
    const thresholdHigh = floatBetween("RAG_THRESHOLD_HIGH", 0.7, 0, 1);
    const thresholdMedium = floatBetween("RAG_THRESHOLD_MEDIUM", 0.5, 0, 1);

    // Anti-hallucination: ladder confidence harus berurutan.
    if (!(0 < thresholdMedium && thresholdMedium < thresholdHigh && thresholdHigh <= 1)) {
      throw new Error(
        `Konfigurasi threshold RAG tidak valid: butuh 0 < RAG_THRESHOLD_MEDIUM < RAG_THRESHOLD_HIGH <= 1. ` +
          `Saat ini MEDIUM=${thresholdMedium}, HIGH=${thresholdHigh}.`,
      );
    }

    _ragConfig = {
      maxResults: positiveInt("RAG_MAX_RESULTS", 5),
      thresholdHigh,
      thresholdMedium,
      // Margin minimum score antara hasil #1 dan #2 agar dianggap HIGH.
      highMargin: floatBetween("RAG_HIGH_MARGIN", 0.02, 0, 1),
      // Rate limit internal API (permintaan per menit per kunci/IP).
      rateLimitPerMinute: positiveInt("RAG_RATE_LIMIT_PER_MINUTE", 60),
    };
  }
  return _ragConfig;
}

let _maxUploadMb: number | undefined;
/** Batas ukuran file upload (MB). Optional, default 15. */
export function getMaxUploadMb(): number {
  if (_maxUploadMb === undefined) {
    _maxUploadMb = positiveInt("MAX_UPLOAD_MB", 15);
  }
  return _maxUploadMb;
}

// =========================================================
//  LLM (chat completion) — dipakai Generate FAQ dari dokumen
// =========================================================
// Openai-compatible (Ollama / vLLM / LM Studio / LocalAI). Default base
// mengikuti EMBEDDING_BASE_URL (server Ollama yang sama), sehingga admin yang
// sudah punya Ollama embedding tidak perlu set tambahan selain LLM_MODEL.

export interface LlmConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
  temperature: number;
}

let _llmConfig: LlmConfig | undefined;
/** Konfigurasi LLM untuk chat completion. Optional — divalidasi saat dipakai. */
export function getLlmConfig(): LlmConfig {
  if (!_llmConfig) {
    const embeddingBase = optional("EMBEDDING_BASE_URL", "").replace(/\/+$/, "");
    const baseUrl = optional("LLM_BASE_URL", embeddingBase || "http://localhost:11434/v1")
      .replace(/\/+$/, "");
    _llmConfig = {
      baseUrl,
      model: optional("LLM_MODEL", "qwen2.5"),
      apiKey: process.env.LLM_API_KEY ?? "",
      temperature: floatBetween("LLM_TEMPERATURE", 0.2, 0, 2),
    };
  }
  return _llmConfig;
}

let _uploadDir: string | undefined;
// Upload folder (relatif terhadap cwd; di Docker volume baak_uploads → /app/uploads)
/** Folder penyimpanan file upload (relatif ke working dir). */
export function getUploadDir(): string {
  if (_uploadDir === undefined) {
    _uploadDir = optional("UPLOAD_DIR", "uploads");
  }
  return _uploadDir;
}

// =========================================================
//  Objek `env` (aksesor lazy) — kompatibel dengan pemanggil lama.
//
//  Setiap properti memvalidasi env HANYA saat diakses. Properti yang butuh
//  secret (authSecret, internalApiKey, databaseUrl) hanya diakses dari fungsi
//  yang benar-benar memakainya, sehingga meng-import modul ini saat
//  `next build` (tanpa secret runtime) aman.
// =========================================================

export const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: process.env.NODE_ENV === "production",

  get appUrl() {
    return getAppUrl();
  },

  get databaseUrl() {
    return getDatabaseUrl();
  },

  get authSecret() {
    return getAuthSecret();
  },

  // NextAuth v4: maxAge sesi (default 8 jam — lebih pendek dari bawaan 30 hari).
  get authMaxAgeSeconds() {
    return getAuthMaxAgeSeconds();
  },

  get internalApiKey() {
    return getInternalApiKey();
  },

  get embedding() {
    return getEmbeddingConfig();
  },

  get rag() {
    return getRagConfig();
  },

  get maxUploadMb() {
    return getMaxUploadMb();
  },

  get uploadDir() {
    return getUploadDir();
  },

  get llm() {
    return getLlmConfig();
  },
});

export type AppEnv = typeof env;
