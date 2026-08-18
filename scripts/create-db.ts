/**
 * BAAK AI — buat database PostgreSQL jika belum ada.
 *
 * Postgres tidak punya "CREATE DATABASE IF NOT EXISTS". Skrip ini mencoba
 * terhubung ke database target; bila gagal (database tidak ada), ia terhubung
 * ke database `postgres` dan membuat database target.
 *
 * Usage: npm run db:create
 */

import { Client } from "pg";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });

function parseUrl(url: string): {
  base: string;
  dbName: string;
  user: string;
} {
  const urlObj = new URL(url);
  const dbName = urlObj.pathname.replace(/^\//, "");
  urlObj.pathname = "/postgres"; // connect ke db maintenance
  return { base: urlObj.toString(), dbName, user: urlObj.username };
}

async function main() {
  const databaseUrl =
    process.env.DATABASE_URL ??
    "postgresql://baak:baak_pass@localhost:5433/baak_ai";
  const { base, dbName, user } = parseUrl(databaseUrl);

  // Coba connect langsung ke target — sukses berarti DB sudah ada.
  const direct = new Client({ connectionString: databaseUrl });
  try {
    await direct.connect();
    await direct.end();
    console.log(`[db:create] Database "${dbName}" sudah ada.`);
    return;
  } catch {
    // lanjut buat
  }

  const admin = new Client({ connectionString: base });
  try {
    await admin.connect();
    await admin.query(
      `CREATE DATABASE "${dbName}" OWNER "${user}" ENCODING 'UTF8';`,
    );
    console.log(`[db:create] Database "${dbName}" berhasil dibuat.`);
  } catch (err) {
    console.error("[db:create] GAGAL:", err);
    process.exit(1);
  } finally {
    await admin.end();
  }
}

main().catch((err) => {
  console.error("[db:create] GAGAL:", err);
  process.exit(1);
});
