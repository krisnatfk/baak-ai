# BAAK AI — Implementation Plan

> **Status:** Phase 1 — Audit & Planning
> **Tanggal:** 2026-08-13
> **Target:** Admin Dashboard + Knowledge Base + RAG API, berjalan di Docker, tanpa menyentuh sistem WhatsApp yang sudah berjalan (WAHA, n8n, Local LLM).

---

## 1. Konteks & Batasan

Sistem chatbot WhatsApp **sudah berjalan** dengan alur:

```text
WhatsApp → WAHA → n8n → AI Agent (DinoAI) → Local LLM → WAHA Send → WhatsApp
```

Yang **dibangun sekarang** adalah lapisan *knowledge resmi*:

```text
Admin Dashboard
  + Knowledge Base (PostgreSQL + pgvector)
  + Embedding & Semantic Search
  + RAG API  →  dikonsumsi oleh n8n sebagai konteks untuk Local LLM
```

### Batasan keras (tidak boleh dilanggar)
- ❌ Tidak membuat ulang WhatsApp integration / WAHA / n8n / Local LLM.
- ❌ Tidak menaruh seluruh FAQ ke dalam System Prompt.
- ❌ Tidak meng-hardcode informasi kampus di kode.
- ❌ Tidak menggunakan OpenAI/Gemini sebagai dependensi wajib.
- ❌ Tidak membuat data akademik palsu (seed hanya DEMO, ditandai jelas).
- ❌ Tidak menyimpan password plaintext; tidak mengekspos kredensial ke frontend.

---

## 2. Ringkasan Arsitektur

```text
                  ADMIN BAAK
                      │
                      ▼
             Admin Dashboard (Next.js 16, App Router)
                      │
                      ▼
       Server Actions + Route Handlers (services layer)
                      │
                      ▼
             PostgreSQL 16 + pgvector (Docker)
                      │
                  Knowledge Base
                      ▼
                  RAG Service
                      ▲
                      │  POST /api/rag/context (Bearer INTERNAL_API_KEY)
WhatsApp → WAHA → n8n ──┘
                      ▼
              Semantic Retrieval (embedding query → pgvector HNSW → Top-K)
                      ▼
                 Local LLM (tidak berubah)
                      ▼
                    n8n → WAHA → WhatsApp
```

**Pemisahan utama (sesuai spesifikasi):**
| Layer | Isi |
|---|---|
| System Prompt | Hanya aturan perilaku AI (di n8n / AI Agent — tidak disentuh) |
| Knowledge | Seluruh informasi BAAK di PostgreSQL + pgvector |
| Workflow | n8n mengatur orkestrasi (tidak diubah) |

---

## 3. Keputusan Teknis

| Area | Keputusan | Alasan |
|---|---|---|
| Framework | Next.js 16.3 (App Router) + TypeScript | Terbukti jalan di lingkungan ini (DinoAI), stabil |
| Styling | Tailwind CSS 4 + shadcn/ui + Lucide Icons | Spesifikasi |
| Database | PostgreSQL 16 + pgvector (`pgvector/pgvector:pg16`) | Self-hosted, vector similarity |
| ORM | Drizzle ORM + drizzle-kit | Dukungan `vector()` native, HNSW index, migrasi SQL ringan |
| Auth | NextAuth v4 (JWT strategy) + Credentials + bcryptjs | Pola yang sama dengan DinoAI (terbukti jalan di Next 16) |
| Validasi | Zod 4 (reusable schemas di `src/validations/`) | Server + client, type-safe |
| Form | React Hook Form + Zod | Spesifikasi komponen form, UX admin |
| Charts | Recharts 3 | Data database nyata, terbukti di DinoAI |
| Embedding | Service abstraction → `openai-compatible` (Ollama/LM Studio/vLLM) + fallback dev `hash` | Tidak boleh bergantung provider tertentu; dimensi configurable |
| Testing | Vitest 4 (unit) + skrip integrasi API + semantic test | Spesifikasi |
| Logging | Structured JSON logger | Observability, tanpa log token/password |
| Deployment | Docker Compose (`app`, `postgres`, + `n8n` existing) | Selalu-on 24 jam |

### Versi utama (dipastikan saat scaffolding)
`next@16.3.0`, `react@19.2.8`, `tailwindcss@4.3.3`, `drizzle-orm@0.45.2`, `next-auth@4.24.15`, `bcryptjs@3`, `zod@4`, `recharts@3`, `lucide-react`, `pg@8.23`.

---

## 4. Port & Topologi (PENTING)

Port host yang sudah terpakai dan tidak boleh bentrok:

| Port | Dipakai oleh |
|---|---|
| 3000 | DinoAI (AI Agent existing) |
| 3005 | WAHA |
| 5678 | n8n |
| 5432 | PostgreSQL host (DinoAI) |
| 8000 | LLM Gateway lokal |

Port yang dipakai BAAK AI:

| Port | Service | Keterangan |
|---|---|---|
| 3001 | app (dev, host) | `npm run dev` |
| 3010 | app (Docker, host) | `docker compose up` |
| 5433 | postgres (host) | map dari container 5432 |

> Jika port 3001/3010/5433 bentrok, ubah di `.env` dan `docker-compose.yml`.

---

## 5. Model Data Ringkas

Tabel lengkap & relasi ada di `DATABASE_SCHEMA.md`. Ringkasan:

```text
roles ─┬─ users ──────── assigned_admin (human_handoffs)
       │
knowledge_categories ── knowledge_items ── knowledge_alternative_questions
                              │  └─ knowledge_sources
                              │  └─ embedding vector(...) + embedding_status
                              └─ knowledge_documents ── knowledge_document_chunks

chat_sessions ── chat_messages
unanswered_questions
human_handoffs
retrieval_logs
audit_logs
```

### Embedding column & dimensi
- `knowledge_items.embedding` bertipe `vector(${EMBEDDING_DIMENSION})` dari pgvector.
- Dimensi dibaca dari env `EMBEDDING_DIMENSION` saat **migrasi dibuat**. Mengganti model embedding dengan dimensi berbeda → butuh migrasi `ALTER COLUMN`.
- Indeks HNSW hanya valid pada kolom berdimensi tetap → dimensi di-pin di migrasi.

---

## 6. Fase Pekerjaan

### PHASE 1 — Audit & Planning ✅
- [x] Audit environment (WAHA/n8n/DinoAI/port/embedding server).
- [x] `IMPLEMENTATION_PLAN.md` (file ini).
- [ ] `DATABASE_SCHEMA.md`, `API_SPEC.md`, `docs/*.md`, `README.md`.
- [ ] Adversarial design review (schema, security, RAG) — masukan dirapikan.

### PHASE 2 — Foundation
- [ ] Scaffold Next.js 16 + TS + Tailwind 4 + shadcn/ui.
- [ ] Docker: `Dockerfile`, `docker-compose.yml` (app + postgres + n8n existing), `.dockerignore`.
- [ ] `.env.example` + dokumentasi environment.
- [ ] Drizzle: schema, client, migrasi awal (termasuk `CREATE EXTENSION vector`), seed development.
- [ ] Auth: NextAuth v4 credentials, roles (SUPER_ADMIN/ADMIN/VIEWER), login, logout, protected routes, middleware.
- [ ] Layout dashboard (sidebar + header) + halaman placeholder.
- [ ] ✅ `npm run lint && npm run typecheck && npm run build` PASS.

### PHASE 3 — Knowledge Management
- [ ] Category CRUD.
- [ ] Source CRUD.
- [ ] FAQ CRUD (question, answer, category, audience, keywords, alternatives, source, source_url, internal_note, status).
- [ ] Search + filter + pagination (server-side).
- [ ] Audit log setiap perubahan.
- [ ] ✅ Build PASS.

### PHASE 4 — Embedding & RAG
- [ ] Embedding service (interface + openai-compatible + hash fallback + factory).
- [ ] Normalisasi teks sebelum embedding (gabungan question + alternatives + category + keywords + answer).
- [ ] Generate & simpan embedding saat FAQ ditambah/diubah; `embedding_status` + retry bila gagal.
- [ ] Semantic search: embed query → pgvector cosine → Top-K.
- [ ] `POST /api/rag/search` (auth internal) → JSON results.
- [ ] `POST /api/rag/context` → `found`/`confidence`/`context`/`sources` + anti-halusinasi + capture unanswered.
- [ ] Threshold confidence configurable via env.
- [ ] ✅ Build PASS.

### PHASE 5 — Operational Features
- [ ] Halaman "Pertanyaan Tidak Terjawab" + aksi "Tambahkan ke Knowledge Base" (auto-fill form).
- [ ] Halaman "Percakapan" (daftar + detail dengan metadata retrieval).
- [ ] Struktur + halaman "Human Handoff".
- [ ] "Analytics" dengan data database nyata (charts + KPI).
- [ ] Dokumen knowledge (upload TXT/PDF/DOCX → chunk → embed → pgvector).
- [ ] ✅ Build PASS.

### PHASE 6 — n8n Integration
- [ ] Endpoint internal final (`/api/rag/context` + `/api/rag/search`).
- [ ] `docs/N8N-INTEGRATION.md` + contoh konfigurasi HTTP Request node.
- [ ] Contoh request/response yang bisa langsung dipakai.

### PHASE 7 — QA & Ship
- [ ] `npm run lint`, `npm run typecheck`, `npm run build` PASS.
- [ ] Migrasi DB + seed dari nol (Docker).
- [ ] Unit test (Vitest) + semantic test + skrip API integration test.
- [ ] Security review (rate limit, auth internal, CSRF, env, injection, XSS).
- [ ] Responsive review (desktop-first, tablet/mobile dasar).
- [ ] README final + dokumentasi lengkap.

---

## 7. Sukses (Scenario Check)

1. **Admin tambah FAQ** → simpan → embedding otomatis dibuat (embedding_status COMPLETED).
2. **Semantic search**: `"min kalau saya mau ngajuin magang gimana?"` → menemukan FAQ PKL meski kalimat berbeda.
3. **n8n** → `POST /api/rag/context` → dapat `context` relevan → Local LLM menjawab.
4. **Tidak ada knowledge** → confidence LOW → `requiresHuman: true` → pertanyaan disimpan ke `unanswered_questions`.
5. **Admin** membuka "Pertanyaan Tidak Terjawab" → "Tambahkan ke Knowledge Base" → FAQ tersimpan → pertanyaan serupa berikutnya terjawab.

---

## 8. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Tidak ada embedding model lokal yang jalan | Abstraction + fallback hash (dev). Dokumen langkah setup Ollama + bge-m3. Nilai `EMBEDDING_PROVIDER=hash` hanya untuk dev |
| Dimensi embedding berubah | Dimensi dipin di migrasi via env; dokumentasi migrasi `ALTER COLUMN` |
| Threshold similarity belum terkalibrasi | Default dev + dokumentasi kalibrasi dengan dataset nyata |
| Port bentrok | Topologi port sudah dicek; semua configurable |
| Dependensi Next 16 baru | Stack disamakan dengan DinoAI yang sudah terbukti |
| PostgreSQL host 5432 terpakai | Postgres app di container, map host 5433 |
