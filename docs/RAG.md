# AI PMB — RAG (Retrieval-Augmented Generation)

## Konsep

```text
Pertanyaan WhatsApp
        ↓
  Normalisasi teks
        ↓
  Embedding query
        ↓
  pgvector cosine similarity (HNSW, Top-K)
        ↓
  Threshold confidence
        ↓
  Build context prompt  →  Local LLM (di n8n/AI Agent)
```

Knowledge retrieval **hanya** membaca `knowledge_items` (FAQ) dan `knowledge_document_chunks` (dokumen). Chat history TIDAK menjadi sumber RAG (pemisahan knowledge memory vs conversation memory).

## Normalisasi Teks

`normalizeText()` di `src/services/rag/normalize.ts`:

- Lowercase (Indonesia tetap dipertahankan aksen).
- Normalisasi Unicode (NFKC), quotes/dashes/koma → spasi seragam.
- Hapus whitespace berlebih, hapus emoji/symbol non-penting.
- Trim.

## Teks yang di-embed (FAQ)

Gabungan informasi (spesifikasi §16), bukan hanya pertanyaan:

```text
Pertanyaan:
{question}

Variasi pertanyaan:
{alt1}
{alt2}

Kategori:
{category.name}

Keywords:
{keyword1}, {keyword2}

Jawaban:
{answer}
```

Fungsi: `buildEmbeddingText()` di `src/services/rag/embedding-text.ts`.

## Pencarian

1. Embed query → vektor `q`.
2. Query pgvector: `ORDER BY embedding <=> q` (cosine distance), `WHERE status='ACTIVE' AND deleted_at IS NULL AND embedding IS NOT NULL`, `LIMIT K`.
3. `score = 1 - distance` (cosine similarity).
4. Jika skor tertinggi dokumen juga relevan, hasil digabung FAQ + dokumen.

## Confidence & Threshold

Threshold dibaca dari env:

```env
RAG_HIGH_CONFIDENCE_THRESHOLD=0.70
RAG_MEDIUM_CONFIDENCE_THRESHOLD=0.50
RAG_MAX_RESULTS=5
```

| Confidence | Kondisi | Perilaku n8n |
|---|---|---|
| `HIGH` | `score >= HIGH` | beri context; AI boleh menjawab percaya diri |
| `MEDIUM` | `score >= MEDIUM` | beri context; AI menjawab HANYA dari knowledge base, dengan hati-hati, tanpa disclaimer otomatis dan tanpa selalu mengarahkan ke BAAK |
| `LOW` | `score < MEDIUM` | JANGAN paksa menjawab → `found:false`, `context:null`, `requiresHuman:true`, simpan `unanswered_questions` |

> ⚠️ Nilai default adalah titik awal development. **Harus dikalibrasi** dengan dataset pertanyaan nyata: ambil sampel pertanyaan → hitung distribusi skor jawaban benar/salah → pilih threshold yang memisahkan keduanya.

## Format Context (anti-halusinasi)

Fungsi `buildRagContext()` menghasilkan prompt siap pakai untuk n8n. Prompt
**tidak memuat** ID, skor kemiripan, atau detail internal apa pun:

```text
Kamu adalah asisten akademik universitas (AI PMB). Jawablah pertanyaan
pengguna dengan bahasa Indonesia yang ramah dan singkat.

=== KNOWLEDGE BASE ===

Sumber 1:
[FAQ] Bagaimana cara mendaftar PKL?
<jawaban resmi admin>

Sumber 2:
[Dokumen] Pedoman Akademik 2026
<konten chunk>

=== AKHIR KNOWLEDGE BASE ===

Aturan: gunakan HANYA informasi dari blok KNOWLEDGE BASE di atas.
Jangan menambah fakta yang tidak ada di konteks. Bila konteks tidak
memuat jawaban, katakan jujur bahwa Anda belum tahu dan, bila perlu,
sarankan menghubungi BAAK / admin.
```

- `HIGH` dan `MEDIUM` memakai prompt yang sama; perbedaannya di sisi n8n.
- `MEDIUM` menjawab dengan hati-hati dari knowledge base saja — **tanpa**
  disclaimer otomatis, tanpa memaksa mengarahkan ke BAAK, dan skor tidak
  pernah diungkap ke pengguna.
- `LOW` → `context: null`; endpoint mengembalikan `found:false`,
  `requiresHuman:true` dan menyimpan pertanyaan ke `unanswered_questions`.

## Respons Endpoint (`POST /api/rag/context`)

Selain `success`, `found`, `confidence`, `score`, `context`, `thresholds`
(backward-compatible), respons kini menyertakan:

| Field | Isi |
|---|---|
| `sources` | Rujukan hasil pencarian + sumber resmi per-FAQ (`knowledge_item_sources`), dedupe, HANYA dari DB |
| `suggestions` | Pertanyaan terkait: relasi eksplisit (admin) > kategori sama > kemiripan semantik, max 5, **bukan** buatan LLM |
| `media` | Media FAQ teratas (tipe, caption, URL via `/api/files/...` atau URL eksternal) — bukan base64 |
| `attachments` | Lampiran FAQ teratas (judul, tipe, nama file, ukuran, MIME, URL file) |
| `requiresHuman` | `false` saat FOUND; `true` saat NOT FOUND |

Saat `found:false`, `sources`, `suggestions`, `media`, dan `attachments`
dikembalikan sebagai array kosong.

## Embedding Service

Interface (`src/services/embedding/provider.ts`):

```ts
interface EmbeddingProvider {
  readonly dimension: number;
  embedTexts(texts: string[]): Promise<number[][]>;
  embed(text: string): Promise<number[]>;
  readonly model: string;
}
```

Implementasi:

1. **`OpenAICompatibleEmbeddingProvider`** (produksi) — `POST {EMBEDDING_BASE_URL}/embeddings` `{model, input}`; mendukung Ollama, LM Studio, vLLM, LocalAI. Opsional `EMBEDDING_API_KEY`.
2. **`HashEmbeddingProvider`** (dev fallback) — embedding deterministik berbasis hashing token. **Bukan untuk produksi**; dipakai agar sistem berjalan tanpa server embedding.

Pemilihan via `EMBEDDING_PROVIDER` (`openai-compatible` | `hash`). Default dev: `hash`.

### Setup embedding model lokal (disarankan)

**Ollama:**

```bash
ollama pull bge-m3          # multilingual, 1024 dimensi (bagus untuk Bahasa Indonesia)
ollama serve                # port 11434
```

```env
EMBEDDING_PROVIDER=openai-compatible
EMBEDDING_BASE_URL=http://host.docker.internal:11434/v1
EMBEDDING_MODEL=bge-m3
EMBEDDING_DIMENSION=1024
EMBEDDING_API_KEY=ollama
```

> Alternatif lokal: `nomic-embed-text` (768), `multilingual-e5-large` (1024). Pastikan `EMBEDDING_DIMENSION` sama dengan output model, lalu jalankan `npm run db:generate && npm run db:migrate` bila berubah.

## Gagal Embedding ≠ Hilang Data

- FAQ tetap tersimpan; `embedding_status = FAILED` + `embedding_error`.
- UI menampilkan badge FAILED + tombol **Retry Embedding**.
- FAQ berstatus FAILED tidak ikut di-retrieve (query membutuhkan `embedding IS NOT NULL`).

## Logging RAG

Setiap query dicatat ke `retrieval_logs` (query, session, skor, confidence, durasi) + structured log `info`/`warn`.
