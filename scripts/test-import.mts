/**
 * scripts/test-import.mts — uji pipeline bulk import FAQ (1 / 10 / 100 / 2000).
 *
 * Menguji end-to-end lapisan service (tanpa server action / HTTP):
 *   parseFaqImportFile (CSV) → validateFaqRow → detectDuplicates (exact),
 * lalu membuktikan DB menampung 2000 FAQ via bulk insert + cleanup.
 *
 * Data scratch memakai prefix "[BULK-TEST]" dan DIHAPUS setelah selesai —
 * data existing TIDAK diubah/dihapus.
 *
 * Usage: npm run test:api:import  (tambahkan script di package.json)
 *   atau : npx tsx scripts/test-import.mts
 */

import "dotenv/config";

// Uji dedup exact bersifat deterministik — paksa provider hash agar level
// semantik (yang butuh server embedding + lambat untuk 2000 baris) dilewati.
// Dedup semantik divalidasi terpisah via cosineSimilarity (unit test) + UI.
process.env.EMBEDDING_PROVIDER = "hash";

import { sql } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { knowledgeItems } from "@/db/schema";
import { parseFaqImportFile } from "@/services/faq/import-parser";
import { validateFaqRow } from "@/services/faq/import-validate";
import { detectDuplicates } from "@/services/faq/duplicate";

const KNOWN_CATEGORIES = ["PKL", "Akademik", "Beasiswa", "Kemahasiswaan"];
const EXISTING_DUP_QUESTION = "Bagaimana cara mendaftar PKL?";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Buat CSV dengan campuran baris yang terkontrol. */
function buildCsv(n: number): string {
  const header =
    "question,answer,category,audience,status,keywords,alternative_questions";
  const lines: string[] = [header];
  for (let i = 0; i < n; i++) {
    const mod = i % 20;
    let question = `Pertanyaan test bulk ${i}?`;
    let answer = `Jawaban test bulk nomor ${i}.`;
    let category = KNOWN_CATEGORIES[i % KNOWN_CATEGORIES.length];
    const audience = "MAHASISWA";
    const status = "DRAFT";
    const keywords = "uji || bulk";

    if (mod >= 0 && mod < 16) {
      // valid (16 dari 20)
    } else if (mod === 16) {
      answer = ""; // error: missing answer
    } else if (mod === 17) {
      category = `Kategori Baru ${i}`; // warning: unknown category
    } else if (mod === 18 || mod === 19) {
      question = EXISTING_DUP_QUESTION; // duplicate exact vs existing
      category = "PKL";
    }

    lines.push(
      [
        csvEscape(question),
        csvEscape(answer),
        csvEscape(category),
        audience,
        status,
        keywords,
        `Alternatif ${i} 1 || Alternatif ${i} 2`,
      ].join(","),
    );
  }
  return lines.join("\n");
}

function summary(label: string, pass: boolean, detail: string) {
  console.log(`${pass ? "✅ PASS" : "❌ FAIL"}  ${label}${pass ? "" : `\n        ↳ ${detail}`}`);
}

async function runPipeline(n: number): Promise<void> {
  console.log(`\n--- Pipeline N=${n} ---`);
  const csv = buildCsv(n);
  const rows = await parseFaqImportFile(Buffer.from(csv), `test-${n}.csv`);

  const ctx = { categories: new Set(KNOWN_CATEGORIES.map((c) => c.toLowerCase())) };
  let valid = 0;
  let warning = 0;
  let error = 0;
  for (const row of rows) {
    const v = validateFaqRow(row, ctx);
    if (v.status === "VALID") valid++;
    else if (v.status === "WARNING") warning++;
    else if (v.status === "ERROR") error++;
  }

  const dupMap = await detectDuplicates(rows);
  const duplicate = dupMap.size;

  const expectedError = Math.floor(n / 20); // 1 per 20 (mod 16)
  const expectedWarning = Math.floor(n / 20); // 1 per 20 (mod 17)
  const expectedDup = Math.floor(n / 20) * 2; // 2 per 20 (mod 18,19)

  summary(
    `parse N=${n}`,
    rows.length === n,
    `rows=${rows.length}, expected ${n}`,
  );
  summary(
    `validate N=${n}`,
    error === expectedError && warning === expectedWarning,
    `error=${error} (${expectedError}), warning=${warning} (${expectedWarning}), valid=${valid}`,
  );
  summary(
    `dedup-exact N=${n}`,
    duplicate === expectedDup,
    `duplicate=${duplicate}, expected ${expectedDup}`,
  );
}

async function runDbBulkInsert(n: number): Promise<void> {
  console.log(`\n--- DB bulk insert N=${n} ---`);
  // Bersihkan sisa run sebelumnya.
  await db
    .delete(knowledgeItems)
    .where(sql`question LIKE '[BULK-TEST]%'`);

  const t0 = performance.now();
  const values = Array.from({ length: n }, (_, i) => ({
    question: `[BULK-TEST] Pertanyaan bulk ${i}?`,
    answer: `Jawaban bulk ${i}.`,
    categoryId: null,
    audience: "MAHASISWA" as const,
    keywords: ["bulk", "test"],
    status: "DRAFT" as const,
    embeddingStatus: "PENDING" as const,
    embedding: null,
    embeddingError: null,
    embeddingModel: null,
    embeddingTextVersion: null,
    createdBy: null,
    updatedBy: null,
  }));

  const inserted = await db
    .insert(knowledgeItems)
    .values(values)
    .onConflictDoNothing()
    .returning({ id: knowledgeItems.id });

  const ms = Math.round(performance.now() - t0);
  const count = await db.$count(
    knowledgeItems,
    sql`question LIKE '[BULK-TEST]%'`,
  );

  summary(
    `insert ${n} FAQ`,
    inserted.length === n && count === n,
    `inserted=${inserted.length}, count=${count}, ${ms}ms`,
  );

  // Cleanup.
  await db
    .delete(knowledgeItems)
    .where(sql`question LIKE '[BULK-TEST]%'`);
  console.log("        cleanup selesai (data scratch dihapus).");
}

async function main() {
  console.log("=".repeat(72));
  console.log("BAAK AI — Test bulk import FAQ (1/10/100/2000)");
  console.log(`  DB   : ${process.env.DATABASE_URL?.replace(/:[^:@/]+@/, ":****@")}`);
  console.log("=".repeat(72));

  await runPipeline(1);
  await runPipeline(10);
  await runPipeline(100);
  await runPipeline(2000);

  await runDbBulkInsert(2000);

  console.log("\n" + "=".repeat(72));
  console.log("Selesai.");
  console.log("=".repeat(72));
  await pool.end();
}

main().catch((err) => {
  console.error("Skrip test-import gagal:", err);
  process.exit(1);
});
