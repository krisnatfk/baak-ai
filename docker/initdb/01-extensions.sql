-- =========================================================
--  Inisialisasi database (dijalankan hanya saat volume PERTAMA
--  kali dibuat oleh Postgres container).
-- =========================================================

-- pgvector: wajib untuk kolom `embedding` (HNSW/IVFFlat index).
CREATE EXTENSION IF NOT EXISTS vector;

-- (Opsional) UUID generator bila dipakai di masa depan.
-- CREATE EXTENSION IF NOT EXISTS pgcrypto;
