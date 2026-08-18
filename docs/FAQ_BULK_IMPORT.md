# BAAK AI — Bulk Import & Generate FAQ

Dokumen ini menjelaskan fitur **Bulk Import FAQ**, **Export**, **Generate FAQ
dari dokumen**, serta mekanisme **duplicate detection** dan **batch embedding**.

## 1. Format File Import (XLSX / CSV)

Header kolom (nama kanonikal Inggris; alias Bahasa Indonesia diterima):

| Kolom | Wajib | Keterangan |
|---|---|---|
| `question` | ✅ | Pertanyaan utama (FAQ). |
| `answer` | ✅ | Jawaban resmi. |
| `category` | ✅ | Nama kategori (harus ada di KB, atau resolusi saat preview). |
| `audience` | ✅ | `MAHASISWA` / `CALON_MAHASISWA` / `ALUMNI` / `ORANG_TUA` / `UMUM`. |
| `status` | ✅ | `DRAFT` / `ACTIVE` / `INACTIVE` / `NEEDS_REVIEW` (alias: `PUBLISHED`→ACTIVE, `ARCHIVED`→INACTIVE). Kosong = `DRAFT`. |
| `keywords` | — | Kata kunci, multi-nilai (separator `||`). |
| `reference_url` | — | URL rujukan (kolom `source_url`). |
| `primary_source` | — | Nama Sumber global (`knowledge_sources.title`); dicocokkan case-insensitive. |
| `official_sources` | — | Sumber Resmi per-FAQ, format `Judul|https://...`, multi-nilai `||`. |
| `related_questions` | — | Pertanyaan Terkait (teks), multi-nilai `||`. |
| `alternative_questions` | — | Pertanyaan Alternatif, multi-nilai `||`. |
| `media` | — | Media, format `Caption|https://...`, multi-nilai `||`. |
| `attachments` | — | Lampiran, format `Judul|PDF|https://...`, multi-nilai `||`. |
| `internal_note` | — | Catatan internal (tidak ikut di-embed / tidak di-RAG). |
| `source_document` | — | (generate) nama dokumen asal. |
| `source_page` | — | (generate) halaman/bagian asal. |
| `validation_status` | — | Opsional; `NEEDS_REVIEW` → status FAQ menjadi Perlu Review. |
| `confidence` | — | Opsional (skor keyakinan generate). |

### Separator array

Kolom bernilai banyak memakai `||` (dua garis vertikal):

```
keywords: PKL || magang || praktik kerja lapangan
alternative_questions: Gimana daftar PKL? || Cara ngajuin PKL gimana?
official_sources: Panduan PKL|https://... || Buku Pedoman|https://...
attachments: Panduan PKL|PDF|https://...
```

Parser aman terhadap field kosong (menjadi array kosong / string kosong).

## 2. Proses Import (Upload → Parse → Validation → Preview → Import)

1. **Upload** file `.xlsx` / `.csv` (server action `previewFaqImport`).
2. **Parse** — header dipetakan ke kolom kanonikal; nilai array dipecah `||`.
3. **Validation** — question/answer wajib; audience/status dipetakan ke enum;
   kategori dicocokkan ke kategori existing.
4. **Duplicate detection** — dua tingkat (lihat §5).
5. **Preview** — disimpan sebagai batch staging (`faq_import_batches` +
   `faq_import_rows`) dengan ringkasan **Total / Valid / Warning / Error /
   Duplikat** dan tabel preview ter-paginasi.
6. **Import** — admin menyelesaikan resolusi kategori & duplikat lalu
   `commitFaqImport`; baris valid di-insert ke `knowledge_items` +
   tabel anak, `embedding_status = PENDING`, lalu antrian embedding diproses.

### Resolusi kategori

Kategori yang belum ada muncul sebagai **Warning** dengan pilihan:
**Petakan ke kategori** (pilih kategori existing), **Buat kategori baru**, atau
**Lewati**.

## 3. Duplicate Detection

- **Level 1 (exact):** normalisasi `normalizeText()` (lowercase, NFKC, buang
  emoji/simbol) lalu bandingkan terhadap FAQ existing (semua yang belum
  terhapus) dan antar baris file. Contoh: `Bagaimana cara mendaftar PKL?` =
  `bagaimana cara mendaftar pkl`.
- **Level 2 (semantic):** embedding pertanyaan via provider yang sama dengan
  RAG, cosine similarity terhadap FAQ existing (pgvector) dan antar baris.
  Kemiripan ≥ `0.92` ditandai **Possible Duplicate**.

Admin memilih per duplikat: **Skip / Replace / Merge / Import Anyway**.
Duplikat exact tidak bisa "Import Anyway" (dilindungi partial unique index
`lower(question) WHERE deleted_at IS NULL`).

> Bila `EMBEDDING_PROVIDER=hash`, level semantik dilewati (hash bukan retrieval
> semantik yang valid); hanya level exact yang aktif.

## 4. Batch Embedding

FAQ hasil import/generate diset `embedding_status = PENDING`. Worker
`processEmbeddingQueue()` memproses antrian per batch:

- `PENDING` → embed → `COMPLETED` (+ vektor, model, versi teks).
- Gagal → `FAILED` (+ error), tidak membatalkan batch lain.

Progress terlihat di halaman FAQ (summary cards **Embedding Pending / Failed**)
dan tombol **Process Embedding**. Aksi massal **Re-embed** menyetel ulang
`FAILED → PENDING`. Endpoint `POST /api/embedding/process` (n8n) tetap berfungsi
sebagai drain per-batch.

## 5. Generate FAQ dari Dokumen

1. Unggah dokumen (PDF/DOCX/TXT) — ekstraksi & chunking sudah ada.
2. Klik **Generate FAQ** (✨) pada baris dokumen.
3. Setiap chunk dikirim ke LLM (Ollama, openai-compatible) dengan prompt
   anti-halusinasi: **isi dokumen adalah satu-satunya sumber fakta**; biaya/
   deadline/tanggal/SKS/nama/link/telepon/syarat/prosedur/kebijakan/lokasi
   tidak boleh dikarang; bila info tidak cukup, chunk tidak menghasilkan FAQ.
4. Hasil disimpan sebagai FAQ **NEEDS_REVIEW** + provenance
   (`source_document_id`, `source_page`, `source_chunk_id`) dan ditampilkan di
   halaman review `/knowledge/documents/{id}/faq`.
5. Admin **Publish** FAQ yang valid → baru di-embed dan di-serve RAG.

Konfigurasi LLM: `LLM_BASE_URL` (default ikut `EMBEDDING_BASE_URL`),
`LLM_MODEL` (default `qwen2.5`), `LLM_API_KEY` (opsional),
`LLM_TEMPERATURE` (default 0.2).

## 6. Rollback Import

Halaman Import History → Detail batch → **Rollback Import**. Rollback
menghapus (soft-delete) FAQ dari batch tersebut yang masih berstatus
**Draft / Needs Review**; FAQ yang sudah di-**Published/Archive** dipertahankan.
Minta konfirmasi sebelum dieksekusi. Tindakan dicatat di audit log.

## 7. Export

Halaman FAQ → **Export** → XLSX/CSV. Struktur ekspor **sama dengan format
import**, sehingga alur *Export → edit → Import* berjalan.

## 8. Template XLSX

Halaman Import → **Download Template XLSX**. Sheet: `FAQ Import` (header + data
CONTOH bertanda `[CONTOH]` — hapus sebelum import), `Petunjuk`, `Master
Kategori`, `Master Audiens`, `Master Status`.

## 9. Keamanan

- Semua aksi admin memakai `requireRole("ADMIN","SUPER_ADMIN")` + audit log.
- Download template/export memakai sesi admin (bukan `INTERNAL_API_KEY`).
- `INTERNAL_API_KEY` tidak diubah; tidak ada secret yang di-log.
- FAQ hasil import/generate default **DRAFT** / **NEEDS_REVIEW** — tidak
  langsung di-serve RAG (RAG hanya membaca status `ACTIVE`).
