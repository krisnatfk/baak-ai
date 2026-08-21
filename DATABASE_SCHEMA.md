# AI PMB — Database Schema

> PostgreSQL 16 + pgvector. ORM: Drizzle. Primary keys: `uuid` (`gen_random_uuid()`).
> Semua timestamp `timestamptz`. Soft-delete dipakai di tabel knowledge.

---

## Konvensi

- Setiap tabel punya `created_at` / `updated_at` (`timestamptz`, default `now()`).
- Kolom `created_by` / `updated_by` mengacu ke `users.id` (uuid, nullable → untuk seed/system).
- Enum memakai string (`varchar`) + konstanta TypeScript, supaya fleksibel & mudah migrasi.
- Embedding bertipe `vector(${EMBEDDING_DIMENSION})` — dimensi dibaca dari env saat migrasi dibuat.

---

## Diagram relasi

```text
roles ─┬─ users
       │        │
       │        ├─ created_by / updated_by  (knowledge, categories, sources, dll)
       │        └─ assigned_admin ────────── human_handoffs
       │
knowledge_categories ──< knowledge_items >── knowledge_alternative_questions
                          │   │   └──< knowledge_sources (nullable)
                          │   │
                          │   └──< knowledge_documents >── knowledge_document_chunks
                          │
unanswered_questions ──────┘  (knowledge_id saat dibuatkan FAQ)

chat_sessions >── chat_messages
   │
human_handoffs >── chat_session_id

retrieval_logs (referensi knowledge_items via jsonb best matches)
audit_logs
```

---

## 1. `users`

Menyimpan akun admin dashboard.

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | uuid PK | default `gen_random_uuid()` |
| `name` | varchar(150) | |
| `email` | varchar(255) UNIQUE | |
| `password_hash` | varchar(255) | bcrypt, tidak pernah plaintext |
| `role_id` | uuid FK → roles.id | |
| `status` | varchar(20) | `ACTIVE` / `INACTIVE` |
| `last_login_at` | timestamptz nullable | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Index: `users_email_unique`, `users_role_id_idx`.

## 2. `roles`

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | uuid PK | |
| `key` | varchar(50) UNIQUE | `SUPER_ADMIN` / `ADMIN` / `VIEWER` |
| `name` | varchar(100) | label Indonesia |
| `description` | text | |
| `permissions` | jsonb | daftar permission keys |
| `is_system` | boolean | true = tidak bisa dihapus |
| `created_at` | timestamptz | |

### Permission map (role → permissions)

| Permission | SUPER_ADMIN | ADMIN | VIEWER |
|---|---|---|---|
| `knowledge:read` | ✅ | ✅ | ✅ |
| `knowledge:write` | ✅ | ✅ | ❌ |
| `conversations:read` | ✅ | ✅ | ✅ |
| `unanswered:read` | ✅ | ✅ | ✅ |
| `unanswered:write` | ✅ | ✅ | ❌ |
| `handoffs:read` | ✅ | ✅ | ✅ |
| `handoffs:write` | ✅ | ✅ | ❌ |
| `analytics:read` | ✅ | ✅ | ✅ |
| `settings:read` | ✅ | ✅ | ✅ |
| `settings:write` | ✅ | ❌ | ❌ |
| `users:manage` | ✅ | ❌ | ❌ |
| `audit:read` | ✅ | ❌ | ❌ |

## 3. `knowledge_categories`

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | uuid PK | |
| `name` | varchar(150) UNIQUE | contoh: `PKL` |
| `slug` | varchar(150) UNIQUE | untuk URL |
| `description` | text nullable | |
| `color` | varchar(20) nullable | hex/badge color |
| `is_active` | boolean default true | |
| `created_by` / `updated_by` | uuid FK users | |
| `created_at` / `updated_at` | timestamptz | |

## 4. `knowledge_sources`

Sumber informasi resmi (mis. Buku Pedoman Akademik 2026, Website BAAK).

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | uuid PK | |
| `title` | varchar(255) | |
| `type` | varchar(30) | `MANUAL` / `URL` / `PDF` / `DOCX` / `TXT` |
| `url` | text nullable | |
| `description` | text nullable | |
| `is_active` | boolean default true | |
| `created_by` / `updated_by` | uuid FK | |
| `created_at` / `updated_at` | timestamptz | |

## 5. `knowledge_items` — tabel inti

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | uuid PK | |
| `question` | text NOT NULL | pertanyaan utama |
| `answer` | text NOT NULL | jawaban resmi |
| `category_id` | uuid FK → knowledge_categories | |
| `audience` | varchar(30) | `MAHASISWA` / `CALON_MAHASISWA` / `ALUMNI` / `ORANG_TUA` / `UMUM` |
| `keywords` | text[] | array keyword |
| `source_id` | uuid FK → knowledge_sources nullable | |
| `source_url` | text nullable | |
| `status` | varchar(20) | `DRAFT` / `ACTIVE` / `INACTIVE` / `NEEDS_REVIEW` |
| `internal_note` | text nullable | catatan internal admin |
| `embedding` | `vector(${DIM})` nullable | dari pgvector |
| `embedding_status` | varchar(20) default `PENDING` | `PENDING` / `COMPLETED` / `FAILED` |
| `embedding_error` | text nullable | pesan error embedding |
| `embedding_model` | varchar(200) nullable | model yang menghasilkan vektor |
| `created_by` / `updated_by` | uuid FK | |
| `deleted_at` | timestamptz nullable | soft delete |
| `created_at` / `updated_at` | timestamptz | |

**Index:**
- `knowledge_items_status_idx` (status)
- `knowledge_items_category_id_idx`
- `knowledge_items_updated_at_idx`
- GIN `knowledge_items_keywords_gin` (keywords)
- **HNSW** `knowledge_items_embedding_hnsw` (embedding) `vector_cosine_ops`

**Text yang di-embed** (lihat `docs/RAG.md`): gabungan `question + alternative_questions + category + keywords + answer`, sudah dinormalisasi.

## 6. `knowledge_alternative_questions`

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | uuid PK | |
| `knowledge_id` | uuid FK → knowledge_items (ON DELETE CASCADE) | |
| `question` | text | variasi pertanyaan |
| `created_at` | timestamptz | |

Index: `knowledge_alternative_questions_knowledge_id_idx`.

## 7. `knowledge_documents` (fitur dokumen)

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | uuid PK | |
| `title` | varchar(255) | |
| `source_id` | uuid FK → knowledge_sources nullable | |
| `file_name` | varchar(255) | nama asli file |
| `file_type` | varchar(20) | `PDF` / `DOCX` / `TXT` |
| `file_size` | integer | bytes |
| `file_path` | text | path di volume upload |
| `status` | varchar(30) | `PENDING` / `PROCESSING` / `COMPLETED` / `FAILED` |
| `error` | text nullable | |
| `chunk_count` | integer default 0 | |
| `created_by` | uuid FK | |
| `created_at` / `updated_at` | timestamptz | |

## 8. `knowledge_document_chunks`

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | uuid PK | |
| `document_id` | uuid FK → knowledge_documents (CASCADE) | |
| `chunk_index` | integer | urutan |
| `content` | text | |
| `token_estimate` | integer | estimasi token |
| `embedding` | `vector(${DIM})` nullable | |
| `embedding_status` | varchar(20) | `PENDING`/`COMPLETED`/`FAILED` |
| `embedding_error` | text nullable | |
| `created_at` | timestamptz | |

Index: HNSW `chunks_embedding_hnsw`, `chunks_document_id_idx`.

## 9. `chat_sessions`

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | uuid PK | |
| `session_id` | varchar(191) UNIQUE | id sesi dari WAHA/n8n |
| `sender` | varchar(50) | nomor WA (mis. `62812xxxx`) |
| `channel` | varchar(30) default `WHATSAPP` | |
| `topic` | varchar(150) nullable | kategori/topik terdeteksi |
| `message_count` | integer default 0 | |
| `last_message_at` | timestamptz | |
| `status` | varchar(20) | `ACTIVE` / `CLOSED` / `HANDOFF` |
| `created_at` / `updated_at` | timestamptz | |

Index: `chat_sessions_last_message_at_idx`.

> **Penting (spesifikasi §41):** tabel ini adalah *conversation memory*, terpisah dari knowledge base. RAG tetap hanya membaca `knowledge_items` + `knowledge_document_chunks`.

## 10. `chat_messages`

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | uuid PK | |
| `session_id` | uuid FK → chat_sessions (CASCADE) | |
| `role` | varchar(20) | `USER` / `AI` / `SYSTEM` |
| `content` | text | |
| `metadata` | jsonb nullable | retrieved knowledge, confidence, score, response_time_ms, dll |
| `created_at` | timestamptz | |

Index: `chat_messages_session_id_idx`, `chat_messages_created_at_idx`.

## 11. `unanswered_questions`

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | uuid PK | |
| `question` | text | pertanyaan pengguna |
| `sender` | varchar(50) nullable | |
| `session_id` | varchar(191) nullable | |
| `best_similarity_score` | numeric(6,4) nullable | skor terbaik saat capture |
| `status` | varchar(30) | `NEW` / `REVIEWED` / `ANSWERED` / `ADDED_TO_KNOWLEDGE` / `IGNORED` |
| `knowledge_id` | uuid FK → knowledge_items nullable | terisi saat dibuatkan FAQ |
| `notes` | text nullable | catatan admin |
| `created_at` | timestamptz | |
| `reviewed_at` | timestamptz nullable | |
| `reviewed_by` | uuid FK users nullable | |

Index: `unanswered_status_idx`, `unanswered_created_at_idx`.

## 12. `human_handoffs`

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | uuid PK | |
| `chat_session_id` | uuid FK → chat_sessions nullable | |
| `sender` | varchar(50) | |
| `question` | text | |
| `reason` | text nullable | alasan handoff |
| `status` | varchar(30) | `OPEN` / `ASSIGNED` / `IN_PROGRESS` / `RESOLVED` / `CLOSED` |
| `assigned_admin_id` | uuid FK users nullable | |
| `note` | text nullable | |
| `created_at` | timestamptz | |
| `resolved_at` | timestamptz nullable | |
| `resolved_by` | uuid FK users nullable | |

Index: `handoffs_status_idx`, `handoffs_created_at_idx`.

## 13. `retrieval_logs`

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | uuid PK | |
| `query` | text | pertanyaan asli |
| `session_id` | varchar(191) nullable | |
| `sender` | varchar(50) nullable | |
| `embed_time_ms` | integer nullable | |
| `search_time_ms` | integer nullable | |
| `top_score` | numeric(6,4) nullable | skor tertinggi |
| `confidence` | varchar(20) nullable | `HIGH` / `MEDIUM` / `LOW` |
| `best_knowledge_id` | uuid nullable | |
| `threshold_high` | numeric(6,4) nullable | snapshot threshold |
| `threshold_medium` | numeric(6,4) nullable | |
| `result_count` | integer default 0 | |
| `created_at` | timestamptz | |

Index: `retrieval_logs_created_at_idx`, `retrieval_logs_best_knowledge_id_idx`.

## 14. `audit_logs`

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK users nullable | |
| `user_email` | varchar(255) nullable | denormalisasi agar tetap terbaca |
| `action` | varchar(50) | `CREATE` / `UPDATE` / `DELETE` / `LOGIN` / `EXPORT` / dll |
| `entity` | varchar(50) | `knowledge_item`, `category`, `source`, dll |
| `entity_id` | uuid nullable | |
| `old_data` | jsonb nullable | snapshot sebelum |
| `new_data` | jsonb nullable | snapshot sesudah |
| `ip` | varchar(64) nullable | |
| `user_agent` | text nullable | |
| `created_at` | timestamptz | |

Index: `audit_logs_entity_idx`, `audit_logs_created_at_idx`.

---

## Migrasi

- Tool: `drizzle-kit`.
- Migrasi awal: `CREATE EXTENSION IF NOT EXISTS vector;` + seluruh tabel + index HNSW.
- Perintah: `npm run db:generate` (membuat dari schema + env), `npm run db:migrate` (apply), `npm run db:seed`.
- Seed hanya data **DEMO / DEVELOPMENT**, tanpa aturan akademik fiktif.
- Detail: `docs/DATABASE.md` & `docs/DEPLOYMENT.md`.
