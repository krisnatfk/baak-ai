/**
 * BAAK AI — migrasi database (custom).
 *
 * Mengapa custom (bukan `drizzle-kit migrate` langsung)?
 *   1. drizzle-kit TIDAK pernah mengeluarkan `CREATE EXTENSION vector`.
 *      Kolom `embedding vector(n)` butuh ekstensi pgvector ada duluan.
 *   2. Menjalankan migrasi dengan koneksi terpisah agar aman.
 *
 * Alur: CREATE EXTENSION IF NOT EXISTS vector → drizzle-kit migrate (import migrator).
 *
 * Dipakai di:
 *   - lokal  : npm run db:migrate
 *   - Docker : docker-entrypoint.sh
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://baak:baak_pass@localhost:5433/baak_ai";

async function main() {
  console.log("[db:migrate] Koneksi ke database ...");

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 10_000,
  });

  // Langkah 1 — ekstensi pgvector (idempotent).
  const client = await pool.connect();
  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS vector;");
    console.log("[db:migrate] CREATE EXTENSION vector OK.");
  } finally {
    client.release();
  }

  // Langkah 2 — apply migrasi Drizzle.
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
    console.log("[db:migrate] Migrasi Drizzle selesai.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[db:migrate] GAGAL:", err);
  process.exit(1);
});
