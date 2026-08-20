# BAAK AI — API Specification

Format JSON, UTF-8. Semua timestamp `ISO-8601`.

Dua kelompok endpoint:

1. **Internal API** — dipakai n8n, dilindungi `Authorization: Bearer ${INTERNAL_API_KEY}`.
2. **Admin API** — dipakai dashboard, dilindungi session NextAuth + role/permission check.

---

## 1. Internal API (untuk n8n)

Semua endpoint internal mengharuskan header:

```http
Authorization: Bearer <INTERNAL_API_KEY>
X-Request-Id: <optional>
```

Jika key salah / tidak ada → `401 {"success":false,"error":"UNAUTHORIZED"}`.
Rate limit: default `RAG_RATE_LIMIT_PER_MINUTE` (default 60/menit/key) → `429`.

### 1.1 `POST /api/rag/search`

Search langsung, mengembalikan top-K knowledge mentah.

**Request**
```json
{ "query": "min kalau saya mau ngajuin magang gimana?", "limit": 5 }
```

| Field | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `query` | string | ✅ | teks pertanyaan pengguna |
| `limit` | number | ❌ | 1–20, default `RAG_MAX_RESULTS` |

**Response 200**
```json
{
  "success": true,
  "query": "min kalau saya mau ngajuin magang gimana?",
  "results": [
    {
      "id": "3f0c...",
      "question": "Bagaimana cara mendaftar PKL?",
      "answer": "...",
      "category": "PKL",
      "source": "Pedoman Akademik 2026",
      "score": 0.91
    }
  ]
}
```

### 1.2 `POST /api/rag/context` *(endpoint utama n8n)*

Mengembalikan konteks siap-pakai untuk Local LLM, plus logika anti-halusinasi.

**Request**
```json
{
  "message": "Kak cara ambil PKL gimana?",
  "sessionId": "whatsapp-session-id",
  "sender": "628xxxx"
}
```

| Field | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `message` | string | ✅ | pesan mahasiswa |
| `sessionId` | string | ❌ | id sesi WhatsApp (dipakai chat memory) |
| `sender` | string | ❌ | nomor pengirim |

**Response 200 — ditemukan (HIGH/MEDIUM)**
```json
{
  "success": true,
  "found": true,
  "confidence": "HIGH",
  "score": 0.91,
  "context": "Gunakan hanya informasi resmi berikut ... === KNOWLEDGE BASE === ...",
  "sources": [
    { "title": "Bagaimana cara mendaftar PKL?", "source": "Pedoman Akademik 2026" }
  ]
}
```

**Response 200 — tidak ditemukan (LOW)**
```json
{
  "success": true,
  "found": false,
  "confidence": "LOW",
  "score": 0.38,
  "requiresHuman": true,
  "message": "Pertanyaan disimpan sebagai pertanyaan tidak terjawab."
}
```

| Field | Makna |
|---|---|
| `confidence` | `HIGH` ≥ `RAG_HIGH_CONFIDENCE_THRESHOLD`; `MEDIUM` ≥ `RAG_MEDIUM_CONFIDENCE_THRESHOLD`; else `LOW` |
| `context` | prompt terformat (lihat `docs/RAG.md`); kosong bila LOW |
| `requiresHuman` | `true` saat LOW → n8n diarahkan ke alur human/unknown |

**Efek samping** (automatis, idempotent):
- Menyimpan `chat_sessions`/`chat_messages` (jika `sessionId` ada).
- Menyimpan `retrieval_logs`.
- Bila LOW → menyimpan `unanswered_questions` (status `NEW`).

### 1.3 `POST /api/bot/resolve`

Menentukan route bot dan mempertahankan greeting sebagai metadata, termasuk
ketika pesan diteruskan ke RAG sebagai `QUESTION`.

**Request**

```json
{ "message": "assalamualaikum kak, jadwal pmb kapan?" }
```

**Response 200 — greeting + question**

```json
{
  "success": true,
  "route": "QUESTION",
  "reason": "GREETING_WITH_QUESTION",
  "ragQuery": "jadwal pmb kapan?",
  "responseText": null,
  "greeting": {
    "detected": true,
    "canonical": "assalamualaikum",
    "reply": "Waalaikumsalam Kak 👋"
  }
}
```

Untuk question tanpa greeting, ketiga nilai greeting adalah
`false`/`null`/`null`. Gunakan `ragQuery` untuk retrieval dan prompt AI. Setelah
AI menghasilkan isi jawaban tanpa salam, n8n dapat membentuk teks akhir dari
`greeting.reply + "\n\n" + answerBody` hanya jika `greeting.detected` dan
`greeting.reply` tersedia. Jangan menambahkan fallback `Halo Kak`.

Untuk `WELCOME`, `responseText` sudah merupakan greeting + intro/menu yang
telah dideduplikasi. Untuk `MENU`, greeting selalu tidak terdeteksi.

### 1.4 `GET /api/health`

Health check untuk container / monitoring.

```json
{ "status": "ok", "db": "ok", "time": "..." }
```

---

## 2. Admin API / Server Actions

UI menggunakan **Next.js Server Actions** untuk mutasi (CSRF-protected oleh Next.js origin check) + Route Handlers read-only bila diperlukan.

### 2.1 Auth
| Endpoint | Keterangan |
|---|---|
| `POST /api/auth/[...nextauth]` | NextAuth v4 (credentials) |
| `GET /api/auth/session` | sesi saat ini |

### 2.2 Knowledge (server actions)
| Action | Permission | Keterangan |
|---|---|---|
| `createKnowledgeItem` | `knowledge:write` | buat FAQ + alternatives + embedding |
| `updateKnowledgeItem` | `knowledge:write` | edit + re-embed |
| `deleteKnowledgeItem` | `knowledge:write` | soft delete |
| `setKnowledgeStatus` | `knowledge:write` | active/inactive/draft/review |
| `retryKnowledgeEmbedding` | `knowledge:write` | regenerate embedding |
| `bulkKnowledgeAction` | `knowledge:write` | batch (status, delete) |

**Payload `createKnowledgeItem`** (validasi Zod di `src/validations/knowledge.ts`):
```json
{
  "question": "Bagaimana cara mendaftar PKL?",
  "answer": "<jawaban resmi>",
  "categoryId": "<uuid>",
  "audience": "MAHASISWA",
  "keywords": ["PKL", "magang"],
  "alternativeQuestions": ["Cara daftar PKL gimana?", "Saya mau magang"],
  "sourceId": "<uuid | null>",
  "sourceUrl": "https://...",
  "internalNote": "cek kembali per semester",
  "status": "ACTIVE"
}
```

### 2.3 Category & Source (server actions)
| Action | Keterangan |
|---|---|
| `createCategory` / `updateCategory` / `deleteCategory` / `toggleCategory` | `knowledge:write` |
| `createSource` / `updateSource` / `deleteSource` | `knowledge:write` |

### 2.4 Unanswered questions
| Action | Keterangan |
|---|---|
| `listUnanswered` (page) | `unanswered:read` |
| `markUnansweredReviewed` / `ignore` | `unanswered:write` |
| `convertToKnowledge` | `unanswered:write` — buat FAQ dari pertanyaan (auto-fill), lalu set status `ADDED_TO_KNOWLEDGE` |

### 2.5 Conversations
| Endpoint | Keterangan |
|---|---|
| `GET /api/conversations?page=&q=&topic=` | list sesi (pagination) — `conversations:read` |
| `GET /api/conversations/[id]` | detail + messages + metadata retrieval |
| `POST /api/handoffs` | buat handoff — `handoffs:write` |
| `PATCH /api/handoffs/[id]` | update status/assign — `handoffs:write` |

### 2.6 Analytics
| Endpoint | Keterangan |
|---|---|
| `GET /api/analytics/overview` | KPI (total pesan, user, unanswered, handoff, success rate) |
| `GET /api/analytics/trends?days=` | pertanyaan per hari |
| `GET /api/analytics/top-categories` | top kategori |
| `GET /api/analytics/top-faqs` | FAQ paling sering di-retrieve |

### 2.7 Audit & Users
| Endpoint | Keterangan |
|---|---|
| `GET /api/audit-logs?page=` | `audit:read` |
| `GET /api/users`, `POST /api/users`, `PATCH /api/users/[id]` | `users:manage` |

### 2.8 Documents
| Endpoint | Keterangan |
|---|---|
| `POST /api/documents/upload` | upload PDF/DOCX/TXT (multipart) — `knowledge:write`; async parse→chunk→embed |
| `GET /api/documents/[id]/status` | status processing |
| `POST /api/documents/[id]/retry` | retry ingest |

---

## 3. Error convention

```json
{ "success": false, "error": "CODE", "message": "penjelasan untuk manusia" }
```

| HTTP | Code | Makna |
|---|---|---|
| 400 | `VALIDATION_ERROR` | input tidak valid (Zod) |
| 401 | `UNAUTHORIZED` | belum login / API key salah |
| 403 | `FORBIDDEN` | role/permission tidak cukup |
| 404 | `NOT_FOUND` | resource tidak ada |
| 409 | `CONFLICT` | duplikat / state invalid |
| 422 | `EMBEDDING_FAILED` | data tersimpan tapi embedding gagal |
| 429 | `RATE_LIMITED` | melebihi limit |

---

## 4. Keamanan

- Internal API: Bearer token, perbandingan constant-time, rate limit per key.
- Admin: session cookie (httpOnly, SameSite=Lax) + CSRF via Next.js origin check; permission check di tiap action.
- Validasi: Zod di layer action/route (server-side selalu).
- Query: Drizzle prepared statements (parameterized).
- Logging: tanpa password/token (lihat `docs/ARCHITECTURE.md`).
