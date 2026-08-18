/**
 * BAAK AI — koneksi database (server-only).
 *
 * Modul ini TIDAK BOLEH di-import dari kode client (memuat DATABASE_URL).
 * Gunakan di Route Handlers / Server Actions / scripts saja.
 */

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";
import * as relations from "@/db/relations";
import { getDatabaseUrl } from "@/lib/env";

// Schema gabungan (tabel + relasi) — untuk db.query.* relational API.
const fullSchema = { ...schema, ...relations };
type DatabaseSchema = typeof schema & typeof relations;

// Guard server-only: secret tidak pernah masuk bundle client.
if (typeof window !== "undefined") {
  throw new Error("src/db/client.ts hanya boleh di-import dari kode server.");
}

// Pool dinilai lambat (lazy) — jangan buka koneksi saat modul pertama di-import.
const globalForDb = globalThis as unknown as {
  baakPool?: Pool;
  baakDb?: NodePgDatabase<DatabaseSchema>;
};

function createPool(): Pool {
  if (globalForDb.baakPool) return globalForDb.baakPool;

  const rawPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10, // cukup untuk dashboard + RAG
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  // Pool yang sehat: log sekali untuk membantu debugging, jangan crash.
  rawPool.on("error", (err) => {
    console.error("[baak-ai] Unexpected error on idle database client", err);
  });

  // Validasi DATABASE_URL SECARA LAZY, hanya saat koneksi benar-benar
  // dipakai (connect/query/end) — bukan saat modul di-import. Ini membuat
  // `next build` aman: schema/page di-import tanpa membuka koneksi, dan
  // DATABASE_URL (secret runtime dari env_file) baru dicek saat runtime.
  const pool = new Proxy(rawPool, {
    get(target, prop, receiver) {
      if (prop === "connect" || prop === "query" || prop === "end") {
        getDatabaseUrl();
      }
      return Reflect.get(target, prop, receiver);
    },
  });

  globalForDb.baakPool = pool;
  return pool;
}

function createDb(): NodePgDatabase<DatabaseSchema> {
  if (globalForDb.baakDb) return globalForDb.baakDb;
  const db = drizzle(createPool(), { schema: fullSchema });
  globalForDb.baakDb = db;
  return db;
}

export const pool = createPool();
export const db = createDb();

/** Koneksi ad-hoc untuk task migrasi/setup (extensions). */
export async function withSystemConnection<T>(
  fn: (client: import("pg").PoolClient) => Promise<T>,
): Promise<T> {
  getDatabaseUrl();
  const client = await createPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export { schema };
