/**
 * scripts/test-import-xlsx.mts — uji pipeline bulk import FAQ XLSX (10 / 100 / 2000).
 *
 * Pasangan XLSX dari scripts/test-import.mts: membuktikan parseFaqImportFile
 * menangani file XLSX biner asli (bukan CSV) dalam skala 10/100/2000 baris,
 * termasuk regresi error "Cannot read properties of undefined (reading 'sheets')".
 *
 * Alur: build XLSX in-memory (exceljs writeBuffer, sheet 'FAQ Import' pertama)
 *   → parseFaqImportFile → validateFaqRow → detectDuplicates (exact),
 * lalu insert 2000 baris hasil parse ke DB (scratch [BULK-TEST], dihapus setelah).
 *
 * Data scratch memakai prefix "[BULK-TEST]" dan DIHAPUS setelah selesai —
 * data existing TIDAK diubah/dihapus.
 *
 * Usage: npx tsx scripts/test-import-xlsx.mts
 *   (atau via npm script: test:api:import:xlsx)
 */

import "dotenv/config";

// Dedup exact bersifat deterministik — pakai provider hash (sama seperti CSV).
process.env.EMBEDDING_PROVIDER = "hash";

import { sql } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { knowledgeItems } from "@/db/schema";
import ExcelJS from "exceljs";
import { FAQ_IMPORT_COLUMNS, parseFaqImportFile } from "@/services/faq/import-parser";
import { validateFaqRow } from "@/services/faq/import-validate";
import { detectDuplicates } from "@/services/faq/duplicate";

const KNOWN_CATEGORIES = ["PKL", "Akademik", "Beasiswa", "Kemahasiswaan"];
const EXISTING_DUP_QUESTION = "Bagaimana cara mendaftar PKL?";

/** Sama seperti buildCsv di test-import.mts, hanya dihasilkan sebagai XLSX. */
function buildXlsx(n: number): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("FAQ Import");
  ws.addRow([...FAQ_IMPORT_COLUMNS]);

  for (let i = 0; i < n; i++) {
    const mod = i % 20;
    let question = `Pertanyaan test bulk ${i}?`;
    let answer = `Jawaban test bulk nomor ${i}.`;
    let category = KNOWN_CATEGORIES[i % KNOWN_CATEGORIES.length];
    const audience = "MAHASISWA";
    const status = "DRAFT";

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

    ws.addRow([
      question,
      answer,
      category,
      audience,
      status,
      "uji || bulk",
      "",
      "",
      "",
      "",
      `Alternatif ${i} 1 || Alternatif ${i} 2`,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
  }

  return wb.xlsx.writeBuffer().then((buf) => Buffer.from(buf));
}

function summary(label: string, pass: boolean, detail: string) {
  console.log(`${pass ? "✅ PASS" : "❌ FAIL"}  ${label}${pass ? "" : `\n        ↳ ${detail}`}`);
}

async function runPipeline(n: number): Promise<void> {
  console.log(`\n--- Pipeline XLSX N=${n} ---`);
  const buf = await buildXlsx(n);
  const rows = await parseFaqImportFile(buf, `test-${n}.xlsx`);
  if (rows.length !== n) {
    summary(`parse N=${n}`, false, `rows=${rows.length}, expected ${n}`);
    return;
  }
  summary(`parse N=${n}`, true, `rows=${rows.length}`);

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

/** XLSX dengan pertanyaan unik semua — untuk menguji kapasitas insert DB. */
function buildXlsxUnique(n: number): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("FAQ Import");
  ws.addRow([...FAQ_IMPORT_COLUMNS]);
  for (let i = 0; i < n; i++) {
    ws.addRow([
      `[BULK-TEST] Pertanyaan unik ${i}?`,
      `Jawaban unik nomor ${i}.`,
      KNOWN_CATEGORIES[i % KNOWN_CATEGORIES.length],
      "MAHASISWA",
      "DRAFT",
      "uji || bulk",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
  }
  return wb.xlsx.writeBuffer().then((buf) => Buffer.from(buf));
}

/** Insert 2000 baris yang BARU SAJA di-parse dari XLSX ke DB (bukti end-to-end). */
async function runDbBulkInsertFromXlsx(n: number): Promise<void> {
  console.log(`\n--- DB bulk insert dari XLSX N=${n} ---`);
  // Bersihkan sisa run sebelumnya.
  await db.delete(knowledgeItems).where(sql`question LIKE '[BULK-TEST]%'`);

  const buf = await buildXlsxUnique(n);
  const rows = await parseFaqImportFile(buf, `test-${n}.xlsx`);

  const t0 = performance.now();
  const values = rows.map((row) => ({
    question: row.question, // sudah ber-prefix [BULK-TEST] dari buildXlsxUnique
    answer: row.answer,
    categoryId: null,
    audience: (row.audience || "MAHASISWA") as "MAHASISWA",
    keywords: row.keywords,
    status: (row.status || "DRAFT") as "DRAFT",
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
    `insert ${n} FAQ (dari XLSX)`,
    inserted.length === n && count === n,
    `inserted=${inserted.length}, count=${count}, ${ms}ms`,
  );

  // Cleanup.
  await db.delete(knowledgeItems).where(sql`question LIKE '[BULK-TEST]%'`);
  console.log("        cleanup selesai (data scratch dihapus).");
}

async function main() {
  console.log("=".repeat(72));
  console.log("BAAK AI — Test bulk import FAQ XLSX (10/100/2000)");
  console.log("=".repeat(72));

  await runPipeline(10);
  await runPipeline(100);
  await runPipeline(2000);

  await runDbBulkInsertFromXlsx(2000);

  console.log("\n" + "=".repeat(72));
  console.log("Selesai.");
  console.log("=".repeat(72));
  await pool.end();
}

main().catch((err) => {
  console.error("Skrip test-import-xlsx gagal:", err);
  process.exit(1);
});
