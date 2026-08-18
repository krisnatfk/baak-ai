/**
 * Konstanta domain yang aman di-import dari kode client.
 *
 * Berbeda dengan `@/db/schema` (yang mengimpor env server-only), modul ini
 * TIDAK punya dependency apa pun — boleh dipakai di Server Component,
 * Server Action, maupun komponen client.
 */

export const AUDIENCE_VALUES = [
  "MAHASISWA",
  "CALON_MAHASISWA",
  "ALUMNI",
  "ORANG_TUA",
  "UMUM",
] as const;
export type Audience = (typeof AUDIENCE_VALUES)[number];

export const RAG_CONFIDENCE_VALUES = ["HIGH", "MEDIUM", "LOW"] as const;
export type RagConfidence = (typeof RAG_CONFIDENCE_VALUES)[number];

export const BEST_SOURCE_TYPE_VALUES = ["FAQ", "CHUNK"] as const;
export type BestSourceType = (typeof BEST_SOURCE_TYPE_VALUES)[number];

export const ROLE_KEYS = ["SUPER_ADMIN", "ADMIN", "VIEWER"] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

// Versi teks yang di-embed — ikut diulik bersama normalizeText.
// Lihat src/lib/embedding/text.ts (buildEmbeddingText).
export const EMBEDDING_TEXT_VERSION = "v1";
