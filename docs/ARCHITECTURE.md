# BAAK AI — Arsitektur

## Alur Keseluruhan

```text
                  ADMIN BAAK
                      │
                      ▼
             Admin Dashboard (Next.js 16 App Router)
                      │
                      ▼
       Server Actions / Route Handlers (service layer)
                      │
                      ▼
              PostgreSQL 16 + pgvector (Docker)
                      │
                      ▼
                  RAG Service
                      ▲            │
                      │            ▼
                      │   Semantic Retrieval (Top-K)
                      │
WhatsApp → WAHA → n8n ──┘
                      ▼
                 Local LLM (existing, tidak diubah)
                      ▼
                    n8n → WAHA → WhatsApp
```

## Pemisahan System Prompt / Knowledge / Workflow

| Lapisan | Isi | Dimana |
|---|---|---|
| **System Prompt** | Aturan perilaku AI saja | n8n / AI Agent (existing — tidak disentuh) |
| **Knowledge** | Seluruh informasi resmi BAAK | PostgreSQL + pgvector (aplikasi ini) |
| **Workflow** | Orkestrasi alur | n8n (existing — hanya ditambah node HTTP) |

Konsekuensi: admin cukup mengelola knowledge base; sistem prompt & workflow tidak menyimpan fakta.

## Struktur Project

```text
src/
├── app/
│   ├── (auth)/login/            # halaman login
│   ├── (admin)/                 # layout + halaman admin (protected)
│   │   ├── dashboard/
│   │   ├── knowledge/faq|dokumen|kategori|sumber/
│   │   ├── percakapan/  unanswered/  handoff/  analytics/  pengaturan/
│   ├── api/                     # route handlers (rag, conversations, analytics, dll)
├── components/                  # shadcn/ui + komponen shared (ui/, layout/)
├── features/                    # modul fitur (knowledge, rag, analytics, conversations, ...)
│   ├── knowledge/               #   actions, components, queries
│   ├── rag/
│   ├── analytics/
│   ├── conversations/
│   └── unanswered/
├── lib/                         # utils, logger, rate-limit, constants, env
├── services/
│   ├── embedding/               # provider abstraction (openai-compatible, hash)
│   ├── rag/                     # normalisasi, prompt, confidence, retrieval
│   ├── retrieval/
│   └── auth/
├── db/                          # drizzle schema, client, migrasi, seed
├── types/                       # domain types + enums
├── validations/                 # zod schemas
└── middleware.ts                # protect admin routes
```

## Lapisan Service

- **`services/embedding/`** — `EmbeddingProvider` interface; implementasi `openai-compatible` & `hash`; factory memilih via `EMBEDDING_PROVIDER`. Business logic lain tidak pernah memanggil HTTP embedding langsung.
- **`services/rag/`** — normalisasi teks, pembuatan embedding-text, build context prompt, mapping confidence, retrieval orchestration (embed query → pgvector → top-K → log).
- **`services/auth/`** — NextAuth options, role/permission guards, audit helper.
- **`features/*/actions.ts`** — server actions (validasi Zod → service → DB → revalidate).
- **`features/*/queries.ts`** — query DB terpaginasi.

## Keamanan (ringkas)

- Kredensial hanya di server (`NEXT_PUBLIC_*` tidak pernah berisi secret).
- Internal API (`/api/rag/*`) pakai `Authorization: Bearer <INTERNAL_API_KEY>` — perbandingan constant-time, tidak pernah diekspos ke client.
- Admin mutation memakai Server Actions (origin check Next.js sebagai CSRF defense).
- Semua input divalidasi Zod di layer server.
- Rate limit in-memory per IP/key (single-instance; catatan untuk multi-instance ada di `docs/DEPLOYMENT.md`).
- Password bcrypt; sesi JWT httpOnly SameSite=Lax.
- Audit log untuk seluruh mutasi knowledge.
- Logging structured JSON, tanpa token/password.

## Logging

`src/lib/logger.ts` — level: `debug|info|warn|error`. Event yang dicatat:
- RAG query (query, session, skor, confidence — tanpa payload sensitif)
- Embedding request & failure
- Database error
- Authentication failure (tanpa kredensial)
- API request summary (method, path, status, durasi)
