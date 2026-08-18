#!/bin/sh
# =========================================================
#  BAAK AI — entrypoint container
#  1) Tunggu PostgreSQL siap (probe TCP via node — nc tidak ada di image).
#  2) Jalankan migrasi database (custom script: CREATE EXTENSION + drizzle).
#  3) (Opsional) seed data DEMO bila tabel kosong & SEED_DEMO_DATA=1.
#  4) Jalankan server Next.js.
#
#  Semua kegagalan harus keluar non-zero agar container crash
#  dan orkestrasi (restart: unless-stopped) dapat memulihkannya.
#
#  CATATAN: /bin/sh di node:24-slim adalah dash (bukan bash), jadi
#  script ini POSIX-only — tanpa `set -o pipefail` dan tanpa nc.
# =========================================================
set -eu

echo "[entrypoint] menunggu PostgreSQL siap di ${DATABASE_URL} ..."

# --- Ekstrak host:port dari DATABASE_URL untuk probe koneksi.
#     format: postgresql://user:pass@host:port/dbname
DB_HOST_PORT=$(printf '%s' "$DATABASE_URL" | sed -E 's#^[^@]*@##; s#/.*$##')
DB_HOST=${DB_HOST_PORT%:*}
DB_PORT=${DB_HOST_PORT##*:}
# Bilamana URL tak menyertakan port (default 5432).
case "$DB_PORT" in
  *[!0-9]*) DB_PORT=5432 ;;
esac
export DB_HOST DB_PORT

# --- Tunggu PostgreSQL siap (node, bukan nc: nc tidak terpasang di image).
#     Berhenti dengan exit non-zero setelah DB_READY_WAIT detik.
DB_READY_WAIT=${DB_READY_WAIT:-60}
node -e '
  const net = require("node:net");
  const host = process.env.DB_HOST;
  const port = Number(process.env.DB_PORT);
  const wait = Number(process.env.DB_READY_WAIT);
  const deadline = Date.now() + wait * 1000;
  const attempt = () => {
    const sock = net.connect(port, host);
    const finish = (code, msg) => {
      sock.destroy();
      if (msg) console.log(msg);
      process.exit(code);
    };
    sock.once("connect", () =>
      finish(0, `[entrypoint] PostgreSQL siap (${host}:${port}).`));
    sock.once("error", () => {
      sock.destroy();
      if (Date.now() >= deadline) {
        finish(1, `[entrypoint] GAGAL: PostgreSQL (${host}:${port}) tidak siap dalam ${wait}s.`);
      } else {
        setTimeout(attempt, 2000);
      }
    });
  };
  attempt();
'

echo "[entrypoint] PostgreSQL siap. Menjalankan migrasi ..."

# Custom migrate script: CREATE EXTENSION IF NOT EXISTS vector terlebih dulu,
# lalu drizzle-kit migrate (skema lengkap di src/db/schema.ts).
node --import tsx scripts/migrate.ts

if [ "${SEED_DEMO_DATA:-0}" = "1" ]; then
  echo "[entrypoint] SEED_DEMO_DATA=1 — menjalankan seed data DEMO (idempotent)."
  node --import tsx scripts/seed.ts || {
    echo "[entrypoint] PERINGATAN: seed gagal (bukan fatal)." >&2
  }
fi

echo "[entrypoint] Starting BAAK AI server di 0.0.0.0:${PORT} ..."
exec "$@"
