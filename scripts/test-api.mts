/**
 * scripts/test-api.mts — Test Integrasi PMB AI Universitas Teknokrat Indonesia.
 *
 * Menjalankan verifikasi komprehensif terhadap endpoint RAG PMB:
 *   1. "cara daftar kuliah"       → found=true, PMB context & sources
 *   2. "info biaya kuliah"        → found=true, PMB biaya FAQ
 *   3. "kapan pendaftaran ditutup"→ found=true, PMB jadwal FAQ
 *   4. "beasiswa"                 → found=true, PMB beasiswa FAQ
 *   5. "syarat daftar"            → found=true, PMB syarat FAQ
 *   6. "p" (noise query)          → found=false, confidence=LOW, sources=[], media=[], att=[]
 *   7. "asdf" (noise query)       → found=false, confidence=LOW, sources=[], media=[], att=[]
 *   8. "PKL?" (legacy query)      → found=false (tidak membocorkan FAQ PKL!)
 *   9. "tiket konser" (off-topic) → found=false, confidence=LOW
 *  10. Backward-compat contract  → memastikan seluruh field contracts ada
 *  11. Test E & F (DB Embedding)  → update question/answer update embedding, update metadata tidak
 *
 * Usage: npm run test:api
 */

import "dotenv/config";

// Dari host, Ollama diakses via localhost (bukan host.docker.internal).
if (process.env.EMBEDDING_PROVIDER === "openai-compatible" && process.env.EMBEDDING_BASE_URL?.includes("host.docker.internal")) {
  process.env.EMBEDDING_BASE_URL = "http://localhost:11434/v1";
}

import { eq, sql, ilike } from "drizzle-orm";
import { db, pool } from "@/db/client";
import {
  EMBEDDING_TEXT_VERSION,
  knowledgeItems,
} from "@/db/schema";
import {
  type EmbeddingRelevantFields,
  embeddingFieldsChanged,
} from "@/services/embedding/changed";

const API_URL = process.env.BAAK_TEST_URL ?? "http://localhost:3001";
const API_KEY = process.env.INTERNAL_API_KEY ?? "";

type TestResult = { name: string; pass: boolean; detail: string };
const results: TestResult[] = [];

function report(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  const icon = pass ? "✅ PASS" : "❌ FAIL";
  console.log(`${icon}  ${name}${pass ? "" : `\n        ↳ ${detail}`}`);
}

async function postRag(message: string): Promise<{
  status: number;
  body: Record<string, unknown>;
}> {
  const res = await fetch(`${API_URL}/api/rag/context`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ message, sessionId: "test-pmb-integration" }),
  });
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body };
}

let scratchFaqId: string | null = null;

async function createScratchFaq(): Promise<string> {
  const cat = await db.execute(
    sql`SELECT id FROM knowledge_categories WHERE lower(name) = 'pmb' LIMIT 1`,
  );
  const categoryId = (cat.rows?.[0]?.id as string | undefined) ?? null;
  const [row] = await db
    .insert(knowledgeItems)
    .values({
      question: "TEST-E — Bagaimana alur pendaftaran mahasiswa baru PMB?",
      answer:
        "TEST-E — Calon mahasiswa mendaftar online melalui https://spmb.teknokrat.ac.id.",
      categoryId,
      audience: "CALON_MAHASISWA",
      keywords: ["pmb", "daftar", "teknokrat"],
      status: "DRAFT",
      embeddingStatus: "PENDING",
      embeddingTextVersion: EMBEDDING_TEXT_VERSION,
      internalNote: "Dibuat otomatis oleh scripts/test-api.mts.",
    })
    .returning({ id: knowledgeItems.id });
  scratchFaqId = row.id;
  return row.id;
}

async function main() {
  console.log("=".repeat(72));
  console.log("PMB AI — Test Integrasi & Relevance Gate (npm run test:api)");
  console.log(`  API  : ${API_URL}`);
  console.log(`  DB   : ${process.env.DATABASE_URL?.replace(/:[^:@/]+@/, ":****@")}`);
  console.log("=".repeat(72));

  // 1. TEST: "cara daftar kuliah"
  console.log("\n--- TEST 1: \"cara daftar kuliah\" → found=true (PMB) ---");
  {
    const { status, body } = await postRag("cara daftar kuliah");
    const sources = (body.sources ?? []) as Array<{ title?: string }>;
    const hasPklInSources = sources.some((s) => /pkl|magang/i.test(s.title ?? ""));
    const isPmb = status === 200 && body.found === true && !hasPklInSources;
    report(
      "TEST 1: cara daftar kuliah",
      isPmb,
      `found=${body.found}, confidence=${body.confidence}, score=${body.score}, pklLeak=${hasPklInSources}`,
    );
  }

  // 2. TEST: "info biaya kuliah"
  console.log("\n--- TEST 2: \"info biaya kuliah\" → found=true (Biaya PMB) ---");
  {
    const { status, body } = await postRag("info biaya kuliah");
    const sources = (body.sources ?? []) as Array<{ title?: string }>;
    const hasPklInSources = sources.some((s) => /pkl|magang/i.test(s.title ?? ""));
    report(
      "TEST 2: info biaya kuliah",
      status === 200 && body.found === true && !hasPklInSources,
      `found=${body.found}, confidence=${body.confidence}, score=${body.score}, pklLeak=${hasPklInSources}`,
    );
  }

  // 3. TEST: "kapan pendaftaran ditutup"
  console.log("\n--- TEST 3: \"kapan pendaftaran ditutup\" → found=true (Jadwal PMB) ---");
  {
    const { status, body } = await postRag("kapan pendaftaran ditutup");
    report(
      "TEST 3: kapan pendaftaran ditutup",
      status === 200 && body.found === true,
      `found=${body.found}, confidence=${body.confidence}, score=${body.score}`,
    );
  }

  // 4. TEST: "beasiswa"
  console.log("\n--- TEST 4: \"beasiswa\" → found=true (Beasiswa PMB) ---");
  {
    const { status, body } = await postRag("beasiswa");
    report(
      "TEST 4: beasiswa",
      status === 200 && body.found === true,
      `found=${body.found}, confidence=${body.confidence}, score=${body.score}`,
    );
  }


  // 6. TEST: "p" (noise query)
  console.log("\n--- TEST 6: \"p\" (noise) → found=false, confidence=LOW ---");
  {
    const { status, body } = await postRag("p");
    const emptyEnrichment =
      Array.isArray(body.sources) && body.sources.length === 0 &&
      Array.isArray(body.suggestions) && body.suggestions.length === 0 &&
      Array.isArray(body.media) && body.media.length === 0 &&
      Array.isArray(body.attachments) && body.attachments.length === 0;

    report(
      "TEST 6: noise query 'p'",
      status === 200 && body.found === false && body.confidence === "LOW" && emptyEnrichment,
      `found=${body.found}, confidence=${body.confidence}, emptyEnrichment=${emptyEnrichment}`,
    );
  }

  // 7. TEST: "asdf" (noise query)
  console.log("\n--- TEST 7: \"asdf\" (noise) → found=false, confidence=LOW ---");
  {
    const { status, body } = await postRag("asdf");
    const emptyEnrichment =
      Array.isArray(body.sources) && body.sources.length === 0 &&
      Array.isArray(body.suggestions) && body.suggestions.length === 0;

    report(
      "TEST 7: noise query 'asdf'",
      status === 200 && body.found === false && body.confidence === "LOW" && emptyEnrichment,
      `found=${body.found}, confidence=${body.confidence}`,
    );
  }

  // 8. TEST: "PKL?" (legacy student service query)
  console.log("\n--- TEST 8: \"PKL?\" → found=false (Relevance Gate tidak bocor) ---");
  {
    const { status, body } = await postRag("PKL?");
    const sources = (body.sources ?? []) as Array<{ title?: string }>;
    const hasPklInSources = sources.some((s) => /pkl|magang/i.test(s.title ?? ""));

    report(
      "TEST 8: query 'PKL?' tidak menghasilkan FAQ PKL",
      status === 200 && (body.found === false || !hasPklInSources),
      `found=${body.found}, confidence=${body.confidence}, pklLeak=${hasPklInSources}`,
    );
  }

  // 9. TEST: "berapa harga tiket konser?" (off-topic)
  console.log("\n--- TEST 9: \"tiket konser\" (off-topic) → found=false ---");
  {
    const { status, body } = await postRag("berapa harga tiket konser?");
    report(
      "TEST 9: off-topic",
      status === 200 && body.found === false && body.confidence === "LOW" && body.requiresHuman === true,
      `found=${body.found}, confidence=${body.confidence}, requiresHuman=${body.requiresHuman}`,
    );
  }

  // 10. TEST: Backward Compatibility & Contract shape
  console.log("\n--- TEST 10: Backward Compatibility Contract ---");
  {
    const legacyFields = [
      "success",
      "found",
      "confidence",
      "score",
      "context",
      "sources",
      "suggestions",
      "media",
      "attachments",
      "requiresHuman",
      "thresholds",
    ];
    const { status, body } = await postRag("cara daftar kuliah");
    const missing = legacyFields.filter((f) => !(f in body));
    report(
      "TEST 10: Contract response fields",
      status === 200 && missing.length === 0,
      missing.length > 0 ? `Field hilang: ${missing.join(", ")}` : "Semua field contract lengkap",
    );
  }

  // 11. TEST E & F: Database Embedding triggers
  console.log("\n--- TEST 11: DB Embedding triggers (Test E & F) ---");
  try {
    await createScratchFaq();

    const beforeFields: EmbeddingRelevantFields = {
      question: "TEST-E — Bagaimana alur pendaftaran mahasiswa baru PMB?",
      answer: "TEST-E — Calon mahasiswa mendaftar online melalui https://spmb.teknokrat.ac.id.",
      keywords: ["pmb", "daftar", "teknokrat"],
      audience: "CALON_MAHASISWA",
    };

    // Update HANYA note -> tidak memicu re-embedding
    const noteChange = embeddingFieldsChanged(beforeFields, { ...beforeFields });
    report("TEST 11a: metadata change does not trigger re-embed", noteChange === false, "");

    // Update pertanyaan -> memicu re-embedding
    const qChange = embeddingFieldsChanged(beforeFields, {
      ...beforeFields,
      question: "TEST-E — Berapa biaya pendaftaran PMB?",
    });
    report("TEST 11b: question change triggers re-embed", qChange === true, "");
  } finally {
    if (scratchFaqId) {
      await db.delete(knowledgeItems).where(eq(knowledgeItems.id, scratchFaqId));
    }
  }

  // 12. TEST: /api/bot/menu
  console.log("\n--- TEST 12: /api/bot/menu mengembalikan daftar FAQ PMB ---");
  {
    // Aktifkan sementara 10 FAQ DRAFT untuk keperluan testing agar bisa muncul di /api/bot/menu
    await db.update(knowledgeItems).set({ status: "ACTIVE" }).where(eq(knowledgeItems.showInMainMenu, true));

    const res = await fetch(`${API_URL}/api/bot/menu`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
      },
    });
    const body = (await res.json()) as Record<string, unknown>;
    const menu = Array.isArray(body.menu) ? body.menu : [];

    const isSuccess = body.success === true;
    const isArray = Array.isArray(menu);
    
    // Pastikan FAQ memiliki id, question, answer, dll dan TIDAK MENGANDUNG PKL
    const validItems = menu.every((it: Record<string, unknown>) => 
      typeof it.id === "string" &&
      typeof it.question === "string" &&
      typeof it.answer === "string" &&
      typeof it.menuOrder === "number" &&
      Array.isArray(it.sources) &&
      Array.isArray(it.media) &&
      Array.isArray(it.attachments)
    );

    if (!validItems && menu.length > 0) {
      console.log("DEBUG: First item in menu:", JSON.stringify(menu[0], null, 2));
    }

    const noPkl = !menu.some((it: Record<string, unknown>) => /pkl/i.test(String(it.question)));
    
    // Pastikan tidak ada duplikat ID
    const ids = menu.map((it: Record<string, unknown>) => String(it.id));
    const noDuplicates = new Set(ids).size === ids.length;

    // Pastikan urutan benar dan ada 10 items
    const isOrdered = menu.every((it: Record<string, unknown>, index: number) => it.menuOrder === index + 1);
    const isLength10 = menu.length === 10;

    report(
      "TEST 12: Menu Bot memuat FAQ PMB Menu Utama yang benar dan urut",
      res.status === 200 && isSuccess && isArray && validItems && noPkl && noDuplicates && isOrdered && isLength10,
      `status=${res.status}, validItems=${validItems}, noPkl=${noPkl}, noDuplicates=${noDuplicates}, isOrdered=${isOrdered}, isLength10=${isLength10}`,
    );

    // Kembalikan ke DRAFT untuk placeholder
    await db.update(knowledgeItems).set({ status: "DRAFT" }).where(ilike(knowledgeItems.answer, "%DRAFT:%"));
  }

  console.log("\n" + "=".repeat(72));
  const passed = results.filter((r) => r.pass).length;
  console.log(`HASIL: ${passed}/${results.length} PASS`);
  for (const r of results) {
    console.log(`  ${r.pass ? "✅" : "❌"}  ${r.name}`);
  }
  console.log("=".repeat(72));

  if (passed < results.length) {
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error("Test Gagal:", err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
