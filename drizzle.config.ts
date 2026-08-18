import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

// drizzle-kit TIDAK membaca .env secara otomatis, jadi muat manual.
// (Rahasia hanya dibaca pada waktu develop/build — tidak pernah client bundle.)
dotenv.config({ path: ".env" });

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://baak:baak_pass@localhost:5433/baak_ai";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databaseUrl,
  },
  // Ekstensi db akan dibuat oleh scripts/migrate.ts (CREATE EXTENSION IF NOT EXISTS vector)
  // dan oleh docker/initdb — TIDAK perlu "prePackages" di sini.
  strict: true,
  verbose: true,
});
