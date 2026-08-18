# BAAK AI — Database & Migrasi

## Ringkasan

- PostgreSQL 16 + pgvector, berjalan di Docker (`pgvector/pgvector:pg16`).
- ORM: **Drizzle** (`drizzle-orm`), migrasi dengan `drizzle-kit`.
- PK uuid (`gen_random_uuid()`). Soft-delete untuk knowledge.
- Schema lengkap: lihat `DATABASE_SCHEMA.md`.

## Setup lokal (tanpa Docker)

```bash
# 1. Install dependency
npm install

# 2. Salin env
cp .env.example .env
# edit DATABASE_URL sesuai postgres lokal (host port 5433 bila memakai compose)

# 3. Buat database (bila belum ada)
npx tsx scripts/create-db.ts

# 4. Migrasi
npm run db:migrate

# 5. Seed development (roles, admin user DEMO, kategori, FAQ DEMO)
npm run db:seed
```

## Perintah migrasi

| Perintah | Keterangan |
|---|---|
| `npm run db:generate` | generate migrasi dari schema (perlu `EMBEDDING_DIMENSION` di env) |
| `npm run db:migrate` | apply migrasi |
| `npm run db:seed` | isi data DEMO/DEVELOPMENT |
| `npm run db:studio` | Drizzle Studio (inspeksi DB) |

## Embedding column & dimensi

- `knowledge_items.embedding` dan `knowledge_document_chunks.embedding` bertipe `vector(${EMBEDDING_DIMENSION})`.
- **Dimensi dipin saat migrasi dibuat** (dibaca dari env). Mengubah model embedding dengan dimensi berbeda → buat migrasi baru:

```bash
# ubah EMBEDDING_DIMENSION di .env
npm run db:generate
npm run db:migrate
```

> Catatan: HNSW index memerlukan dimensi tetap. Jangan mengubah `EMBEDDING_DIMENSION` tanpa migrasi baru.

## Index penting

- `knowledge_items_embedding_hnsw` — HNSW `vector_cosine_ops` pada kolom embedding (hanya baris ACTIVE & non-null).
- `knowledge_items_keywords_gin` — GIN pada `keywords text[]`.
- Index `status`, `category_id`, `updated_at`, `created_at` pada tabel operasional.
- `chunks_embedding_hnsw` untuk chunk dokumen.

## Seed development

Script `src/db/seed.ts` mengisi (semua **DEMO / DEVELOPMENT**):

1. **Roles**: `SUPER_ADMIN`, `ADMIN`, `VIEWER` + permission map.
2. **Admin users** (password di-hash bcrypt):
   - `superadmin@baak.local` / `superadmin123` (SUPER_ADMIN)
   - `admin@baak.local` / `admin123` (ADMIN)
   - `viewer@baak.local` / `viewer123` (VIEWER)
3. **Kategori** (master, tanpa aturan fiktif): Penerimaan Mahasiswa Baru, Registrasi, KRS, KHS, Perkuliahan, PKL, Skripsi, Cuti Akademik, Aktif Kembali, Wisuda, Yudisium, Beasiswa, UKM, Organisasi Mahasiswa, Surat Akademik, Keuangan, Administrasi, Lainnya.
4. **Sumber**: "Website BAAK" (MANUAL), "Buku Pedoman Akademik 2026" (PDF, DEMO).
5. **FAQ DEMO** (jawaban ditandai `[DATA DEMO — isi dengan informasi resmi BAAK]`):
   - FAQ PKL dengan alternative questions termasuk `"Saya mau magang, mulai dari mana?"`, `"Min mau ngajuin magang gimana?"` (dipakai semantic test).
   - FAQ KRS, FAQ Wisuda.
6. **Embedding** untuk FAQ DEMO (dibuat dengan provider aktif saat seed).

> Data DEMO bisa dihapus dengan menghapus baris berawal `[DATA DEMO` / kategori yang tidak terpakai. Jangan mengisi aturan akademik fiktif.

## Migrasi dari nol (Docker)

```bash
docker compose up -d --build
docker compose exec app npm run db:migrate
docker compose exec app npm run db:seed
```

Detail & troubleshooting: `docs/DEPLOYMENT.md`.
