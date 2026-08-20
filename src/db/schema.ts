/**
 * BAAK AI — Drizzle ORM Schema (PostgreSQL 16 + pgvector)
 *
 * Konvensi:
 *  - PK uuid gen_random_uuid()
 *  - timestamp timestamptz, default now()
 *  - Soft delete di tabel knowledge (deleted_at)
 *  - Enum status memakai pgEnum (bukan varchar bebas) agar konsisten di DB.
 *  - Embedding vector(dimensi) — dimensi dibaca dari env (lazy, default 1024).
 *  - HNSW index bersifat PARTIAL, persis mengikuti predikat retrieval:
 *    status='ACTIVE' AND deleted_at IS NULL AND embedding_status='COMPLETED'.
 *  - Kolom embedding_text_version mengunci versi teks yang di-embed (lihat docs/RAG.md).
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { vector } from "drizzle-orm/pg-core/columns/vector_extension/vector";
import { getEmbeddingDimension } from "@/lib/env";
import {
  AUDIENCE_VALUES,
  BEST_SOURCE_TYPE_VALUES,
  EMBEDDING_TEXT_VERSION,
  RAG_CONFIDENCE_VALUES,
  ROLE_KEYS,
  type Audience,
  type BestSourceType,
  type RagConfidence,
  type RoleKey,
} from "@/db/constants";

// Re-export agar pemakai lama (mis. @/db/schema) tetap berfungsi.
export {
  AUDIENCE_VALUES,
  BEST_SOURCE_TYPE_VALUES,
  EMBEDDING_TEXT_VERSION,
  RAG_CONFIDENCE_VALUES,
  ROLE_KEYS,
};
export type { Audience, BestSourceType, RagConfidence, RoleKey };

// ---------------------------------------------------------------------------
// Enum
// ---------------------------------------------------------------------------

export const userStatusEnum = pgEnum("user_status", ["ACTIVE", "INACTIVE"]);

export const knowledgeStatusEnum = pgEnum("knowledge_status", [
  "DRAFT",
  "ACTIVE",
  "INACTIVE",
  "NEEDS_REVIEW",
]);

export const embeddingStatusEnum = pgEnum("embedding_status", [
  "PENDING",
  "COMPLETED",
  "FAILED",
]);

export const knowledgeSourceTypeEnum = pgEnum("knowledge_source_type", [
  "MANUAL",
  "URL",
  "PDF",
  "DOCX",
  "TXT",
]);

export const documentStatusEnum = pgEnum("document_status", [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
]);

export const chatSessionStatusEnum = pgEnum("chat_session_status", [
  "ACTIVE",
  "CLOSED",
  "HANDOFF",
]);

export const chatMessageRoleEnum = pgEnum("chat_message_role", [
  "USER",
  "AI",
  "SYSTEM",
]);

export const unansweredStatusEnum = pgEnum("unanswered_status", [
  "NEW",
  "REVIEWED",
  "ANSWERED",
  "ADDED_TO_KNOWLEDGE",
  "IGNORED",
]);

export const handoffStatusEnum = pgEnum("handoff_status", [
  "OPEN",
  "ASSIGNED",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
]);

export const audienceEnum = pgEnum("audience", AUDIENCE_VALUES);

/**
 * Tipe sumber rujukan PER-FAQ (kaya), dipakai tabel knowledge_item_sources.
 * Terpisah dari knowledge_source_type yang dipakai knowledge_sources/dokumen.
 */
export const knowledgeItemSourceTypeEnum = pgEnum("knowledge_item_source_type", [
  "WEBSITE",
  "DOCUMENT",
  "INTERNAL",
  "OTHER",
]);

/** Tipe media FAQ (khususnya gambar; URL eksternal atau upload). */
export const knowledgeMediaTypeEnum = pgEnum("knowledge_media_type", [
  "IMAGE",
  "VIDEO",
  "OTHER",
]);

/** Tipe lampiran file FAQ (PDF/DOC/DOCX/XLS/XLSX). */
export const knowledgeAttachmentTypeEnum = pgEnum("knowledge_attachment_type", [
  "PDF",
  "DOC",
  "DOCX",
  "XLS",
  "XLSX",
  "OTHER",
]);

/** Status batch bulk import FAQ (history + rollback). */
export const faqImportStatusEnum = pgEnum("faq_import_status", [
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "ROLLED_BACK",
]);

/** Status hasil validasi satu baris import (staging). */
export const faqImportRowStatusEnum = pgEnum("faq_import_row_status", [
  "VALID",
  "WARNING",
  "ERROR",
  "DUPLICATE",
]);

export const botMenuModeEnum = pgEnum("bot_menu_mode", [
  "MANUAL",
  "POPULAR",
  "HYBRID",
]);

export const botStatusEnum = pgEnum("bot_status", [
  "ACTIVE",
  "MAINTENANCE",
  "LIMITED",
]);

export const botMessageRuleTypeEnum = pgEnum("bot_message_rule_type", [
  "GREETING",
  "NOISE",
]);

export const botEventTypeEnum = pgEnum("bot_event_type", [
  "GREETING",
  "MENU_SELECTION",
  "QUESTION",
  "RAG_FOUND",
  "RAG_NOT_FOUND",
  "SIMILAR_SUGGESTION",
  "FAQ_MATCH",
]);

export const botAnswerStyleEnum = pgEnum("bot_answer_style", [
  "SINGKAT",
  "NORMAL",
  "LENGKAP",
]);

// ---------------------------------------------------------------------------
// Helper kolom
// ---------------------------------------------------------------------------

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

const uuidPrimaryKey = () =>
  uuid("id").primaryKey().default(sql`gen_random_uuid()`);

// ---------------------------------------------------------------------------
// 1. users & roles
// ---------------------------------------------------------------------------

export const roles = pgTable("roles", {
  id: uuidPrimaryKey(),
  key: varchar("key", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
  isSystem: boolean("is_system").notNull().default(true),
  createdAt: timestamps.createdAt,
});

export const users = pgTable(
  "users",
  {
    id: uuidPrimaryKey(),
    name: varchar("name", { length: 150 }).notNull(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    status: userStatusEnum("status").notNull().default("ACTIVE"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("users_role_id_idx").on(t.roleId)],
);

// ---------------------------------------------------------------------------
// 3. knowledge_categories
// ---------------------------------------------------------------------------

export const knowledgeCategories = pgTable(
  "knowledge_categories",
  {
    id: uuidPrimaryKey(),
    name: varchar("name", { length: 150 }).notNull().unique(),
    slug: varchar("slug", { length: 150 }).notNull().unique(),
    description: text("description"),
    color: varchar("color", { length: 20 }),
    isActive: boolean("is_active").notNull().default(true),
    /** Tampil di menu bot (GET /api/bot/menu) — hanya kategori aktif yang dipilih. */
    showInBotMenu: boolean("show_in_bot_menu").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedBy: uuid("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [index("knowledge_categories_is_active_idx").on(t.isActive)],
);

// ---------------------------------------------------------------------------
// 4. knowledge_sources
// ---------------------------------------------------------------------------

export const knowledgeSources = pgTable(
  "knowledge_sources",
  {
    id: uuidPrimaryKey(),
    title: varchar("title", { length: 255 }).notNull(),
    type: knowledgeSourceTypeEnum("type").notNull().default("MANUAL"),
    url: text("url"),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedBy: uuid("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [index("knowledge_sources_is_active_idx").on(t.isActive)],
);

// ---------------------------------------------------------------------------
// 5. knowledge_items (tabel inti)
// ---------------------------------------------------------------------------

export const knowledgeItems = pgTable(
  "knowledge_items",
  {
    id: uuidPrimaryKey(),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    categoryId: uuid("category_id").references(() => knowledgeCategories.id, {
      onDelete: "set null",
    }),
    audience: audienceEnum("audience").notNull().default("MAHASISWA"),
    keywords: text("keywords").array().notNull().default([]),
    sourceId: uuid("source_id").references(() => knowledgeSources.id, {
      onDelete: "set null",
    }),
    sourceUrl: text("source_url"),
    status: knowledgeStatusEnum("status").notNull().default("DRAFT"),
    internalNote: text("internal_note"),

    // ---- Fitur Bot Menu Khusus PMB ----
    showInMainMenu: boolean("show_in_main_menu").notNull().default(false),
    mainMenuOrder: integer("main_menu_order"),

    // ---- Embedding ----
    embedding: vector("embedding", { dimensions: getEmbeddingDimension() }),
    embeddingStatus: embeddingStatusEnum("embedding_status")
      .notNull()
      .default("PENDING"),
    embeddingError: text("embedding_error"),
    embeddingModel: varchar("embedding_model", { length: 200 }),
    // Versi teks yang menghasilkan vektor. Retrieval WAJIB menyaring versi ini
    // (cek: embedding_status='COMPLETED' AND embedding_text_version=vN).
    embeddingTextVersion: varchar("embedding_text_version", { length: 20 }),

    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedBy: uuid("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),

    // ---- Bulk import / provenance ----
    // Batch import asal (rollback + history). NULL bila dibuat manual.
    importBatchId: uuid("import_batch_id").references(() => faqImportBatches.id, {
      onDelete: "set null",
    }),
    // Provenance FAQ hasil Generate dari dokumen (review desain §provenance).
    sourceDocumentId: uuid("source_document_id").references(
      () => knowledgeDocuments.id,
      { onDelete: "set null" },
    ),
    sourcePage: integer("source_page"),
    sourceChunkId: uuid("source_chunk_id").references(
      () => knowledgeDocumentChunks.id,
      { onDelete: "set null" },
    ),
    // Confidence skor generasi LLM (opsional; 0..1).
    generationConfidence: numeric("generation_confidence", {
      precision: 6,
      scale: 4,
    }),

    // Soft delete
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("knowledge_items_status_idx").on(t.status),
    index("knowledge_items_category_id_idx").on(t.categoryId),
    index("knowledge_items_updated_at_idx").on(t.updatedAt),
    index("knowledge_items_keywords_gin").using("gin", t.keywords),
    index("knowledge_items_import_batch_id_idx").on(t.importBatchId),
    index("knowledge_items_source_document_id_idx").on(t.sourceDocumentId),
    // Partial HNSW — hanya FAQ yang AKTIF & sudah di-embed & tidak terhapus.
    // Predikat HARUS identik dengan predikat retrieval.
    index("knowledge_items_embedding_hnsw")
      .using("hnsw", t.embedding.op("vector_cosine_ops"))
      .where(
        sql`status = 'ACTIVE' AND deleted_at IS NULL AND embedding_status = 'COMPLETED'`,
      ),
    // Cegah duplikat pertanyaan yang masih aktif (case-insensitive).
    uniqueIndex("knowledge_items_question_unique_active").on(
      sql`lower(question)`,
    ).where(sql`deleted_at IS NULL`),
  ],
);

// ---------------------------------------------------------------------------
// 6. knowledge_alternative_questions
// ---------------------------------------------------------------------------

export const knowledgeAlternativeQuestions = pgTable(
  "knowledge_alternative_questions",
  {
    id: uuidPrimaryKey(),
    knowledgeId: uuid("knowledge_id")
      .notNull()
      .references(() => knowledgeItems.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    index("knowledge_alternative_questions_knowledge_id_idx").on(t.knowledgeId),
  ],
);

// ---------------------------------------------------------------------------
// 6b. knowledge_item_sources — sumber rujukan PER-FAQ (banyak-ke-satu FAQ)
// ---------------------------------------------------------------------------
// Tidak menggantikan knowledge_sources (sumber global/dokumen); tabel ini
// mencatat rujukan resmi khusus FAQ (WEBSITE/DOCUMENT/INTERNAL/OTHER) yang
// akan dikirim ke n8n/WAHA. Relasi & isActive mengikuti knowledge_sources
// bila ada; sumber nonaktif TIDAK ikut dalam respons RAG.

export const knowledgeItemSources = pgTable(
  "knowledge_item_sources",
  {
    id: uuidPrimaryKey(),
    knowledgeId: uuid("knowledge_id")
      .notNull()
      .references(() => knowledgeItems.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    type: knowledgeItemSourceTypeEnum("type").notNull().default("WEBSITE"),
    url: text("url"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    index("knowledge_item_sources_knowledge_id_idx").on(t.knowledgeId),
  ],
);

// ---------------------------------------------------------------------------
// 6c. knowledge_related_questions — pertanyaan terkait yang DIPILIH admin
// ---------------------------------------------------------------------------
// Dua bentuk (salah satu wajib):
//  - relatedKnowledgeId: tautan ke FAQ lain (suggestion langsung dari KB),
//  - question          : pertanyaan terkait teks bebas yang sudah divalidasi
//                        admin (BUKAN buatan LLM).
// Kolom question juga dipakai sebagai snapshot judul FAQ terkait agar tetap
// terbaca walau FAQ terkait dihapus/nonaktif.

export const knowledgeRelatedQuestions = pgTable(
  "knowledge_related_questions",
  {
    id: uuidPrimaryKey(),
    knowledgeId: uuid("knowledge_id")
      .notNull()
      .references(() => knowledgeItems.id, { onDelete: "cascade" }),
    relatedKnowledgeId: uuid("related_knowledge_id").references(
      () => knowledgeItems.id,
      { onDelete: "cascade" },
    ),
    question: text("question"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    index("knowledge_related_questions_knowledge_id_idx").on(t.knowledgeId),
    index("knowledge_related_questions_related_knowledge_id_idx").on(
      t.relatedKnowledgeId,
    ),
  ],
);

// ---------------------------------------------------------------------------
// 6d. knowledge_media — media FAQ (gambar; URL eksternal atau upload)
// ---------------------------------------------------------------------------
// Hanya metadata + path/URL yang disimpan (TANPA base64). URL akses dihasilkan
// dari file_path via endpoint /api/files/[...path] untuk file upload.

export const knowledgeMedia = pgTable(
  "knowledge_media",
  {
    id: uuidPrimaryKey(),
    knowledgeId: uuid("knowledge_id")
      .notNull()
      .references(() => knowledgeItems.id, { onDelete: "cascade" }),
    type: knowledgeMediaTypeEnum("type").notNull().default("IMAGE"),
    caption: text("caption"),
    url: text("url"),
    filePath: text("file_path"),
    fileName: varchar("file_name", { length: 255 }),
    fileSize: integer("file_size"),
    mimeType: varchar("mime_type", { length: 100 }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("knowledge_media_knowledge_id_idx").on(t.knowledgeId)],
);

// ---------------------------------------------------------------------------
// 6e. knowledge_attachments — lampiran file FAQ (PDF/DOC/DOCX/XLS/XLSX)
// ---------------------------------------------------------------------------
// Hanya metadata + path yang disimpan. n8n/WAHA mengunduh file via
// /api/files/[...path] lalu mengirimkannya ke user.

export const knowledgeAttachments = pgTable(
  "knowledge_attachments",
  {
    id: uuidPrimaryKey(),
    knowledgeId: uuid("knowledge_id")
      .notNull()
      .references(() => knowledgeItems.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    type: knowledgeAttachmentTypeEnum("type").notNull().default("PDF"),
    // File upload (filePath) ATAU URL eksternal (url) — salah satu wajib.
    // Bulk import memakai URL; unggah manual memakai filePath.
    filePath: text("file_path"),
    url: text("url"),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    fileSize: integer("file_size").notNull(),
    mimeType: varchar("mime_type", { length: 100 }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("knowledge_attachments_knowledge_id_idx").on(t.knowledgeId)],
);

// ---------------------------------------------------------------------------
// 6f. faq_import_batches — riwayat batch bulk import (history + rollback)
// ---------------------------------------------------------------------------

export const faqImportBatches = pgTable(
  "faq_import_batches",
  {
    id: uuidPrimaryKey(),
    batchCode: varchar("batch_code", { length: 40 }).notNull().unique(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    fileType: varchar("file_type", { length: 10 }).notNull(), // XLSX | CSV
    status: faqImportStatusEnum("status").notNull().default("PROCESSING"),
    totalRows: integer("total_rows").notNull().default(0),
    validCount: integer("valid_count").notNull().default(0),
    warningCount: integer("warning_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    duplicateCount: integer("duplicate_count").notNull().default(0),
    importedCount: integer("imported_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    index("faq_import_batches_created_at_idx").on(t.createdAt),
    index("faq_import_batches_status_idx").on(t.status),
  ],
);

// ---------------------------------------------------------------------------
// 6g. faq_import_rows — staging baris hasil parse+validasi (preview tabel)
// ---------------------------------------------------------------------------
// Setiap baris file import disimpan sebagai jsonb `data` (hasil parse lengkap)
// plus hasil validasi & pesan. Dipakai untuk preview ter-paginasi dan untuk
// komit import (resolusi kategori/duplikat). Dibersihkan bila batch di-rollback.

export const faqImportRows = pgTable(
  "faq_import_rows",
  {
    id: uuidPrimaryKey(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => faqImportBatches.id, { onDelete: "cascade" }),
    rowIndex: integer("row_index").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    validationStatus: faqImportRowStatusEnum("validation_status")
      .notNull()
      .default("VALID"),
    message: text("message"),
    /** ID/teks FAQ yang dianggap duplikat (bila validation_status=DUPLICATE). */
    duplicateOf: text("duplicate_of"),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    index("faq_import_rows_batch_id_idx").on(t.batchId),
    uniqueIndex("faq_import_rows_batch_row_unique").on(t.batchId, t.rowIndex),
  ],
);

// ---------------------------------------------------------------------------
// 7. knowledge_documents
// ---------------------------------------------------------------------------

export const knowledgeDocuments = pgTable(
  "knowledge_documents",
  {
    id: uuidPrimaryKey(),
    title: varchar("title", { length: 255 }).notNull(),
    sourceId: uuid("source_id").references(() => knowledgeSources.id, {
      onDelete: "set null",
    }),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    fileType: knowledgeSourceTypeEnum("file_type").notNull(),
    fileSize: integer("file_size").notNull(),
    filePath: text("file_path").notNull(),
    status: documentStatusEnum("status").notNull().default("PENDING"),
    error: text("error"),
    chunkCount: integer("chunk_count").notNull().default(0),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [index("knowledge_documents_status_idx").on(t.status)],
);

// ---------------------------------------------------------------------------
// 8. knowledge_document_chunks
// ---------------------------------------------------------------------------

export const knowledgeDocumentChunks = pgTable(
  "knowledge_document_chunks",
  {
    id: uuidPrimaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    tokenEstimate: integer("token_estimate").notNull().default(0),
    embedding: vector("embedding", { dimensions: getEmbeddingDimension() }),
    embeddingStatus: embeddingStatusEnum("embedding_status")
      .notNull()
      .default("PENDING"),
    embeddingError: text("embedding_error"),
    embeddingTextVersion: varchar("embedding_text_version", { length: 20 }),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    index("knowledge_document_chunks_document_id_idx").on(t.documentId),
    // Partial HNSW — hanya chunk dari dokumen yang sudah di-embed.
    index("knowledge_document_chunks_embedding_hnsw")
      .using("hnsw", t.embedding.op("vector_cosine_ops"))
      .where(sql`embedding_status = 'COMPLETED'`),
    uniqueIndex("knowledge_document_chunks_document_index_unique").on(
      t.documentId,
      t.chunkIndex,
    ),
  ],
);

// ---------------------------------------------------------------------------
// 9. chat_sessions
// ---------------------------------------------------------------------------

export const chatSessions = pgTable(
  "chat_sessions",
  {
    id: uuidPrimaryKey(),
    sessionId: varchar("session_id", { length: 191 }).notNull().unique(),
    sender: varchar("sender", { length: 50 }),
    channel: varchar("channel", { length: 30 }).notNull().default("WHATSAPP"),
    topic: varchar("topic", { length: 150 }),
    messageCount: integer("message_count").notNull().default(0),
    consecutiveUnanswered: integer("consecutive_unanswered").notNull().default(0),
    handoffShownAt: timestamp("handoff_shown_at", { withTimezone: true }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    status: chatSessionStatusEnum("status").notNull().default("ACTIVE"),
    ...timestamps,
  },
  (t) => [index("chat_sessions_last_message_at_idx").on(t.lastMessageAt)],
);

// ---------------------------------------------------------------------------
// 10. chat_messages
// ---------------------------------------------------------------------------

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuidPrimaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    role: chatMessageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    index("chat_messages_session_id_idx").on(t.sessionId),
    index("chat_messages_created_at_idx").on(t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// 11. unanswered_questions
// ---------------------------------------------------------------------------

export const unansweredQuestions = pgTable(
  "unanswered_questions",
  {
    id: uuidPrimaryKey(),
    question: text("question").notNull(),
    // Normalisasi (kelas-aware) — basis dari partial unique dedup.
    normalizedQuestion: text("normalized_question").notNull(),
    sender: varchar("sender", { length: 50 }),
    sessionId: varchar("session_id", { length: 191 }),
    bestSimilarityScore: numeric("best_similarity_score", {
      precision: 6,
      scale: 4,
    }),
    timesAsked: integer("times_asked").notNull().default(1),
    status: unansweredStatusEnum("status").notNull().default("NEW"),
    knowledgeId: uuid("knowledge_id").references(() => knowledgeItems.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    index("unanswered_questions_status_idx").on(t.status),
    index("unanswered_questions_created_at_idx").on(t.createdAt),
    // Dedup: hanya satu baris "NEW" untuk pertanyaan yang sama.
    uniqueIndex("unanswered_questions_new_unique").on(
      sql`lower(normalized_question)`,
    ).where(sql`status = 'NEW'`),
  ],
);

// ---------------------------------------------------------------------------
// 12. human_handoffs
// ---------------------------------------------------------------------------

export const humanHandoffs = pgTable(
  "human_handoffs",
  {
    id: uuidPrimaryKey(),
    chatSessionId: uuid("chat_session_id").references(() => chatSessions.id, {
      onDelete: "set null",
    }),
    sender: varchar("sender", { length: 50 }).notNull(),
    question: text("question").notNull(),
    reason: text("reason"),
    status: handoffStatusEnum("status").notNull().default("OPEN"),
    assignedAdminId: uuid("assigned_admin_id").references(() => users.id, {
      onDelete: "set null",
    }),
    note: text("note"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    index("human_handoffs_status_idx").on(t.status),
    index("human_handoffs_created_at_idx").on(t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// 13. retrieval_logs
// ---------------------------------------------------------------------------

export const retrievalLogs = pgTable(
  "retrieval_logs",
  {
    id: uuidPrimaryKey(),
    query: text("query").notNull(),
    sessionId: varchar("session_id", { length: 191 }),
    sender: varchar("sender", { length: 50 }),
    embedTimeMs: integer("embed_time_ms"),
    searchTimeMs: integer("search_time_ms"),
    topScore: numeric("top_score", { precision: 6, scale: 4 }),
    confidence: varchar("confidence", { length: 20 }),
    bestKnowledgeId: uuid("best_knowledge_id"),
    // Tipe sumber terbaik: FAQ atau CHUNK (dari dokumen).
    bestSourceType: varchar("best_source_type", { length: 20 }),
    // Snapshot skor teratas untuk analitik & audit (JSON).
    topScores: jsonb("top_scores").$type<Array<Record<string, unknown>>>(),
    thresholdHigh: numeric("threshold_high", { precision: 6, scale: 4 }),
    thresholdMedium: numeric("threshold_medium", { precision: 6, scale: 4 }),
    resultCount: integer("result_count").notNull().default(0),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    index("retrieval_logs_created_at_idx").on(t.createdAt),
    index("retrieval_logs_best_knowledge_id_idx").on(t.bestKnowledgeId),
  ],
);

// ---------------------------------------------------------------------------
// 13b. bot_settings â€” singleton control center runtime PMB
// ---------------------------------------------------------------------------

export const botSettings = pgTable("bot_settings", {
  id: varchar("id", { length: 32 }).primaryKey().default("default"),
  botName: varchar("bot_name", { length: 150 }).notNull().default("Asisten PMB"),
  institutionName: varchar("institution_name", { length: 255 })
    .notNull()
    .default("Universitas Teknokrat Indonesia"),
  userCallName: varchar("user_call_name", { length: 50 }).notNull().default("Kak"),
  welcomeEnabled: boolean("welcome_enabled").notNull().default(true),
  welcomeIntro: text("welcome_intro").notNull(),
  welcomeClosing: text("welcome_closing").notNull(),
  includeMenu: boolean("include_menu").notNull().default(true),
  emojiEnabled: boolean("emoji_enabled").notNull().default(true),
  smartGreetingEnabled: boolean("smart_greeting_enabled").notNull().default(true),
  fuzzyGreetingEnabled: boolean("fuzzy_greeting_enabled").notNull().default(true),
  semanticGreetingEnabled: boolean("semantic_greeting_enabled").notNull().default(true),
  stripGreetingFromQuestion: boolean("strip_greeting_from_question")
    .notNull()
    .default(true),
  greetingSimilarityThreshold: numeric("greeting_similarity_threshold", {
    precision: 6,
    scale: 4,
  })
    .notNull()
    .default("0.8000"),
  greetingModifiers: text("greeting_modifiers")
    .notNull()
    .default("kak,kaka,min,admin,mimin,mas,mba,mbak,pak,bu,bro,gan"),
  menuMode: botMenuModeEnum("menu_mode").notNull().default("MANUAL"),
  popularPeriodDays: integer("popular_period_days").notNull().default(30),
  menuLimit: integer("menu_limit").notNull().default(10),
  menuFinalLabel: varchar("menu_final_label", { length: 255 }),
  similarityEnabled: boolean("similarity_enabled").notNull().default(true),
  similarityHigh: numeric("similarity_high", { precision: 6, scale: 4 })
    .notNull()
    .default("0.7000"),
  similarityMedium: numeric("similarity_medium", { precision: 6, scale: 4 })
    .notNull()
    .default("0.5500"),
  similaritySuggestionEnabled: boolean("similarity_suggestion_enabled")
    .notNull()
    .default(true),
  similarityMaxSuggestions: integer("similarity_max_suggestions")
    .notNull()
    .default(5),
  notFoundMessage: text("not_found_message").notNull(),
  showSuggestionsOnNotFound: boolean("show_suggestions_on_not_found")
    .notNull()
    .default(true),
  showMenuOnNotFound: boolean("show_menu_on_not_found").notNull().default(true),
  status: botStatusEnum("status").notNull().default("ACTIVE"),
  maintenanceMessage: text("maintenance_message").notNull(),
  humanHandoffEnabled: boolean("human_handoff_enabled").notNull().default(true),
  humanHandoffMessage: text("human_handoff_message").notNull().default(""),
  humanHandoffUrl: text("human_handoff_url"),
  humanHandoffPhone: varchar("human_handoff_phone", { length: 50 }),
  humanHandoffAfterUnanswered: integer("human_handoff_after_unanswered")
    .notNull()
    .default(1),
  answerStyle: botAnswerStyleEnum("answer_style").notNull().default("NORMAL"),
  answerTone: varchar("answer_tone", { length: 50 }).notNull().default("RAMAH_PMB"),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
});

export const botMessageRules = pgTable(
  "bot_message_rules",
  {
    id: uuidPrimaryKey(),
    type: botMessageRuleTypeEnum("type").notNull(),
    phrase: varchar("phrase", { length: 255 }).notNull(),
    normalizedPhrase: varchar("normalized_phrase", { length: 255 }).notNull(),
    reply: text("reply"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("bot_message_rules_type_phrase_unique").on(
      t.type,
      t.normalizedPhrase,
    ),
    index("bot_message_rules_active_idx").on(t.isActive),
  ],
);

export const botAnalyticsEvents = pgTable(
  "bot_analytics_events",
  {
    id: uuidPrimaryKey(),
    type: botEventTypeEnum("type").notNull(),
    normalizedQuestion: text("normalized_question"),
    route: varchar("route", { length: 20 }),
    matchedFaqId: uuid("matched_faq_id").references(() => knowledgeItems.id, {
      onDelete: "set null",
    }),
    confidence: varchar("confidence", { length: 20 }),
    score: numeric("score", { precision: 6, scale: 4 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    index("bot_analytics_events_created_at_idx").on(t.createdAt),
    index("bot_analytics_events_type_idx").on(t.type),
    index("bot_analytics_events_matched_faq_idx").on(t.matchedFaqId),
  ],
);

// ---------------------------------------------------------------------------
// 14. audit_logs
// ---------------------------------------------------------------------------

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuidPrimaryKey(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // Denormalisasi agar tetap terbaca walau user dihapus.
    userEmail: varchar("user_email", { length: 255 }),
    action: varchar("action", { length: 50 }).notNull(),
    entity: varchar("entity", { length: 50 }).notNull(),
    entityId: uuid("entity_id"),
    oldData: jsonb("old_data").$type<Record<string, unknown> | null>(),
    newData: jsonb("new_data").$type<Record<string, unknown> | null>(),
    ip: varchar("ip", { length: 64 }),
    userAgent: text("user_agent"),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    index("audit_logs_entity_idx").on(t.entity),
    index("audit_logs_created_at_idx").on(t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Tipe ekspor
// ---------------------------------------------------------------------------

export type Role = typeof roles.$inferSelect;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type KnowledgeCategory = typeof knowledgeCategories.$inferSelect;
export type KnowledgeSource = typeof knowledgeSources.$inferSelect;
export type KnowledgeItem = typeof knowledgeItems.$inferSelect;
export type NewKnowledgeItem = typeof knowledgeItems.$inferInsert;
export type KnowledgeAlternativeQuestion =
  typeof knowledgeAlternativeQuestions.$inferSelect;
export type KnowledgeItemSource = typeof knowledgeItemSources.$inferSelect;
export type NewKnowledgeItemSource = typeof knowledgeItemSources.$inferInsert;
export type KnowledgeRelatedQuestion = typeof knowledgeRelatedQuestions.$inferSelect;
export type NewKnowledgeRelatedQuestion =
  typeof knowledgeRelatedQuestions.$inferInsert;
export type KnowledgeMedia = typeof knowledgeMedia.$inferSelect;
export type NewKnowledgeMedia = typeof knowledgeMedia.$inferInsert;
export type KnowledgeAttachment = typeof knowledgeAttachments.$inferSelect;
export type NewKnowledgeAttachment = typeof knowledgeAttachments.$inferInsert;
export type FaqImportBatch = typeof faqImportBatches.$inferSelect;
export type NewFaqImportBatch = typeof faqImportBatches.$inferInsert;
export type FaqImportRow = typeof faqImportRows.$inferSelect;
export type NewFaqImportRow = typeof faqImportRows.$inferInsert;
export type KnowledgeDocument = typeof knowledgeDocuments.$inferSelect;
export type KnowledgeDocumentChunk =
  typeof knowledgeDocumentChunks.$inferSelect;
export type ChatSession = typeof chatSessions.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type UnansweredQuestion = typeof unansweredQuestions.$inferSelect;
export type HumanHandoff = typeof humanHandoffs.$inferSelect;
export type RetrievalLog = typeof retrievalLogs.$inferSelect;
export type BotSetting = typeof botSettings.$inferSelect;
export type BotMessageRule = typeof botMessageRules.$inferSelect;
export type BotAnalyticsEvent = typeof botAnalyticsEvents.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
