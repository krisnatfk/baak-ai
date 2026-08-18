# BAAK AI — Deployment

## Target

PC/server lokal 24 jam. Deployment utama: **Docker Compose** (`app` + `postgres`), 
menambahkan service ke compose yang **sudah berjalan** (n8n tetap utuh).

## Prasyarat

- Docker Engine + Docker Compose v2+.
- Port kosong: `3010` (app), `5433` (postgres). (3000= DinoAI, 3005= WAHA, 5678= n8n, 5432= Postgres host.)

## Struktur compose

| Service | Image / Build | Port | Keterangan |
|---|---|---|---|
| `n8n` | `docker.n8n.io/n8nio/n8n:latest` (existing) | 5678 | **TIDAK diubah** |
| `postgres` | `pgvector/pgvector:pg16` | 5433→5432 | named volume `baak_pgdata` |
| `app` | build `./` (Next.js standalone) | 3010→3000 | entrypoint: migrate → start |

Semua service `restart: unless-stopped`.

## Jalankan

```bash
# 1. Env
cp .env.example .env
#   - set DATABASE_URL, AUTH_SECRET, INTERNAL_API_KEY, dst.
#   - di dalam Docker, DATABASE_URL memakai host `postgres`:
#     postgresql://baak:baak_pass@postgres:5432/baak_ai

# 2. Build & start
docker compose up -d --build

# 3. Migrasi + seed (sekali)
docker compose exec app npm run db:migrate
docker compose exec app npm run db:seed

# 4. Cek
curl http://localhost:3010/api/health
# {"status":"ok","db":"ok",...}
```

Akses dashboard: `http://localhost:3010`

## Development (host, tanpa Docker untuk app)

```bash
npm install
cp .env.example .env      # DATABASE_URL → localhost:5433
npm run db:migrate
npm run db:seed
npm run dev               # http://localhost:3001
```

## Environment variables

Lihat `.env.example` untuk daftar lengkap. Yang kritis:

| Variable | Keterangan |
|---|---|
| `DATABASE_URL` | koneksi Postgres (di Docker: host `postgres`) |
| `AUTH_SECRET` | secret sesi NextAuth (min 32 byte) |
| `INTERNAL_API_KEY` | key untuk n8n memanggil `/api/rag/*` |
| `EMBEDDING_*` | provider, base url, model, dimensi |
| `RAG_*` | threshold & max results |

## Migrasi & Seed di production

- Migrasi dijalankan otomatis oleh entrypoint container `app`.
- Seed **hanya** development (data berlabel DEMO). Untuk production kosong, jalankan `npm run db:migrate` saja tanpa seed, lalu buat user admin lewat `npm run db:seed` bila ingin (atau via script `scripts/create-admin.ts`).

## Backup

```bash
docker compose exec postgres pg_dump -U baak baak_ai -F c -f /tmp/backup.dump
docker compose cp postgres:/tmp/backup.dump ./backup.dump
```

Volume data: named volume `baak_pgdata` (persistent).

## Upload dokumen (file storage)

File upload disimpan di volume `baak_uploads` → `/app/uploads` di container `app`.
Ukuran default 15 MB per file (dapat diubah di `MAX_UPLOAD_MB`).

## Troubleshooting

| Masalah | Solusi |
|---|---|
| `Could not connect to postgres` | Pastikan service `postgres` healthy: `docker compose ps`; cek `DATABASE_URL` host = `postgres` |
| Embedding FAILED saat seed | Server embedding belum aktif. Set `EMBEDDING_PROVIDER=hash` untuk dev, atau jalankan Ollama + set `EMBEDDING_BASE_URL` |
| Port bentrok | Ubah port di `docker-compose.yml` dan `.env` |
| `vector(1024)` salah dimensi | Ganti `EMBEDDING_DIMENSION` + `npm run db:generate && npm run db:migrate` |
| Build gagal karena native module | Pakai `node:24-slim` (image di Dockerfile) — `pg` murni JS, tidak perlu kompilasi native |
| Multi-instance app | Rate limit in-memory tidak dibagi antar instance → ganti ke Redis atau naikkan limit |

## Monitoring

- Health: `GET /api/health` → untuk Docker healthcheck / uptime monitor.
- Logs: `docker compose logs -f app`.
