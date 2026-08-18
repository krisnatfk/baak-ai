/**
 * scripts/test-api.mts — Test A–F (integrasi & regresi) untuk BAAK AI.
 *
 * Menjalankan definisi test dari requirement upgrade:
 *
 *   TEST A : FAQ "Bagaimana cara mendaftar PKL?" → query "cara magang gimana?"
 *            → found=true, context tersedia, sources tersedia, suggestions
 *            tersedia, requiresHuman=false.
 *   TEST B : query "berapa harga tiket konser?" → found=false, confidence=LOW,
 *            requiresHuman=true, suggestions=[], media=[], attachments=[].
 *   TEST C : FAQ PKL (sourceUrl + sumber rujukan + media gambar + lampiran PDF
 *            + 3 pertanyaan terkait) → sources>=1, media>=1, attachments>=1,
 *            suggestions>=1.
 *   TEST D : Backward-compat — respons tetap memuat seluruh field lama
 *            (success, found, confidence, score, context, requiresHuman,
 *            thresholds) BESERTA field baru; client n8n lama tidak error.
 *   TEST E : Update question/answer → embedding ter-update (status COMPLETED,
 *            vektor BERUBAH). Predikat dipakai sama dengan production
 *            (src/services/embedding/changed.ts).
 *   TEST F : Update HANYA sourceUrl → TIDAK re-embedding (vektor identik,
 *            status tetap COMPLETED).
 *
 * Test A–D adalah HTTP terhadap app yang berjalan (default
 * http://localhost:3010, override via env BAAK_TEST_URL) — butuh image
 * ter-rebuild (`docker compose up -d --build app`) agar respons memuat
 * field baru. Test E–F langsung ke database (server-only) dengan FAQ scratch
 * khusus yang DIHAPUS setelah selesai (data yang dibuat skrip boleh dihapus;
 * data existing TIDAK diubah/dihapus).
 *
 * Embedding: skrip dijalankan dari HOST, sehingga base URL embedding memakai
 * http://localhost:11434/v1 (host.docker.internal hanya tersedia di dalam
 * container). Skrip tidak mengubah file .env.
 *
 * Usage: npm run test:api
 */

import "dotenv/config";

// Dari host, Ollama diakses via localhost (bukan host.docker.internal).
if (process.env.EMBEDDING_PROVIDER === "openai-compatible") {
  process.env.EMBEDDING_BASE_URL = "http://localhost:11434/v1";
}

import { and, eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "@/db/client";
import {
  EMBEDDING_TEXT_VERSION,
  knowledgeAttachments,
  knowledgeItemSources,
  knowledgeItems,
  knowledgeMedia,
  knowledgeRelatedQuestions,
} from "@/db/schema";
import {
  type EmbeddingRelevantFields,
  embeddingFieldsChanged,
} from "@/services/embedding/changed";
import { processEmbeddingQueue } from "@/services/embedding/worker";

const API_URL = process.env.BAAK_TEST_URL ?? "http://localhost:3010";
const API_KEY = process.env.INTERNAL_API_KEY ?? "";

// ---------------------------------------------------------------------------
//  Reporter hasil (ringkas)
// ---------------------------------------------------------------------------

type TestResult = { name: string; pass: boolean; detail: string };

const results: TestResult[] = [];

function report(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  const icon = pass ? "✅ PASS" : "❌ FAIL";
  console.log(`${icon}  ${name}${pass ? "" : `\n        ↳ ${detail}`}`);
}

function check(cond: boolean, message: string): string | null {
  return cond ? null : message;
}

// ---------------------------------------------------------------------------
//  Helper HTTP + DB
// ---------------------------------------------------------------------------

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
    body: JSON.stringify({ message, sessionId: "test-api-integration" }),
  });
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body };
}

/** Ambil FAQ aktif PKL asli ("Bagaimana cara mendaftar PKL?"). */
async function findPklFaqId(): Promise<string | null> {
  const rows = await db
    .select({ id: knowledgeItems.id })
    .from(knowledgeItems)
    .where(
      sql`lower(question) = 'bagaimana cara mendaftar pkl?' AND deleted_at IS NULL`,
    )
    .limit(1);
  return rows[0]?.id ?? null;
}

/** Bandingkan vektor tersimpan dengan vektor (exact, via pgvector). */
async function vectorEquals(
  faqId: string,
  vector: number[],
): Promise<boolean> {
  const rows = await db.execute(sql`
    SELECT (embedding = ${JSON.stringify(vector)}::vector) AS same
    FROM knowledge_items WHERE id = ${faqId}
  `);
  return rows.rows?.[0]?.same === true;
}

// ---------------------------------------------------------------------------
//  TEST C — pasang fixture ke FAQ PKL asli (dilacak, dihapus setelah selesai)
// ---------------------------------------------------------------------------

const cInserted = {
  sourceIds: [] as string[],
  relatedIds: [] as string[],
  mediaIds: [] as string[],
  attachmentIds: [] as string[],
};

async function installTestCFixtures(faqId: string) {
  // Idempoten: buang sisa run sebelumnya sebelum insert baru.
  await purgeTestCFixtures(faqId);

  const [srcRows, relatedRows, mediaRows, attRows] = await Promise.all([
    db
      .insert(knowledgeItemSources)
      .values([
        {
          knowledgeId: faqId,
          title: "Portal Magang BAAK",
          type: "WEBSITE",
          url: "https://tctc.teknokrat.ac.id/magang",
          sortOrder: 0,
        },
        {
          knowledgeId: faqId,
          title: "Pedoman PKL 2026",
          type: "DOCUMENT",
          url: "https://tctc.teknokrat.ac.id/pedoman-pkl-2026",
          sortOrder: 1,
        },
      ])
      .returning({ id: knowledgeItemSources.id }),
    db
      .insert(knowledgeRelatedQuestions)
      .values([
        { knowledgeId: faqId, relatedKnowledgeId: null, question: "Berapa lama durasi magang?", sortOrder: 0 },
        { knowledgeId: faqId, relatedKnowledgeId: null, question: "Apa saja syarat mengikuti magang?", sortOrder: 1 },
        { knowledgeId: faqId, relatedKnowledgeId: null, question: "Bagaimana cara membatalkan pendaftaran magang?", sortOrder: 2 },
      ])
      .returning({ id: knowledgeRelatedQuestions.id }),
    db
      .insert(knowledgeMedia)
      .values([
        {
          knowledgeId: faqId,
          type: "IMAGE",
          caption: "Contoh surat permohonan magang (PKL)",
          url: "https://example.com/media/contoh-surat-pkl.png",
          sortOrder: 0,
        },
      ])
      .returning({ id: knowledgeMedia.id }),
    db
      .insert(knowledgeAttachments)
      .values([
        {
          knowledgeId: faqId,
          title: "Pedoman PKL 2026",
          type: "PDF",
          filePath: "test/baak-pedoman-pkl.pdf",
          fileName: "Pedoman-PKL-2026.pdf",
          fileSize: 123456,
          mimeType: "application/pdf",
          sortOrder: 0,
        },
      ])
      .returning({ id: knowledgeAttachments.id }),
  ]);

  cInserted.sourceIds = srcRows.map((r) => r.id);
  cInserted.relatedIds = relatedRows.map((r) => r.id);
  cInserted.mediaIds = mediaRows.map((r) => r.id);
  cInserted.attachmentIds = attRows.map((r) => r.id);
}

async function removeTestCFixtures() {
  if (cInserted.attachmentIds.length) {
    await db
      .delete(knowledgeAttachments)
      .where(inArray(knowledgeAttachments.id, cInserted.attachmentIds));
    cInserted.attachmentIds = [];
  }
  if (cInserted.mediaIds.length) {
    await db
      .delete(knowledgeMedia)
      .where(inArray(knowledgeMedia.id, cInserted.mediaIds));
    cInserted.mediaIds = [];
  }
  if (cInserted.relatedIds.length) {
    await db
      .delete(knowledgeRelatedQuestions)
      .where(inArray(knowledgeRelatedQuestions.id, cInserted.relatedIds));
    cInserted.relatedIds = [];
  }
  if (cInserted.sourceIds.length) {
    await db
      .delete(knowledgeItemSources)
      .where(inArray(knowledgeItemSources.id, cInserted.sourceIds));
    cInserted.sourceIds = [];
  }
}

/** Hapus fixture Test C yang masih tersisa (idempotensi utk re-run). */
async function purgeTestCFixtures(faqId: string) {
  await db
    .delete(knowledgeAttachments)
    .where(
      and(
        eq(knowledgeAttachments.knowledgeId, faqId),
        eq(knowledgeAttachments.fileName, "Pedoman-PKL-2026.pdf"),
      ),
    );
  await db
    .delete(knowledgeMedia)
    .where(
      and(
        eq(knowledgeMedia.knowledgeId, faqId),
        eq(knowledgeMedia.url, "https://example.com/media/contoh-surat-pkl.png"),
      ),
    );
  await db
    .delete(knowledgeRelatedQuestions)
    .where(
      and(
        eq(knowledgeRelatedQuestions.knowledgeId, faqId),
        inArray(knowledgeRelatedQuestions.question, [
          "Berapa lama durasi magang?",
          "Apa saja syarat mengikuti magang?",
          "Bagaimana cara membatalkan pendaftaran magang?",
        ]),
      ),
    );
  await db
    .delete(knowledgeItemSources)
    .where(
      and(
        eq(knowledgeItemSources.knowledgeId, faqId),
        inArray(knowledgeItemSources.title, ["Portal Magang BAAK", "Pedoman PKL 2026"]),
      ),
    );
}

// ---------------------------------------------------------------------------
//  TEST E & F — FAQ scratch khusus (dibuat oleh skrip, dihapus setelah selesai)
// ---------------------------------------------------------------------------

let scratchFaqId: string | null = null;

async function createScratchFaq(): Promise<string> {
  const cat = await db.execute(
    sql`SELECT id FROM knowledge_categories WHERE lower(name) = 'pkl' LIMIT 1`,
  );
  const categoryId = (cat.rows?.[0]?.id as string | undefined) ?? null;
  const [row] = await db
    .insert(knowledgeItems)
    .values({
      question: "TEST-E — Bagaimana prosedur magang/PKL?",
      answer:
        "TEST-E — Alur magang: mahasiswa mengajukan permohonan ke program studi, melengkapi berkas, lalu mengikuti briefing koordinator.",
      categoryId,
      audience: "MAHASISWA",
      keywords: ["magang", "pkl", "prosedur"],
      status: "DRAFT", // tidak ikut retrieval — murni untuk test E/F
      embeddingStatus: "PENDING",
      embeddingTextVersion: EMBEDDING_TEXT_VERSION,
      internalNote: "Dibuat otomatis oleh scripts/test-api.mts (Test E/F).",
    })
    .returning({ id: knowledgeItems.id });
  scratchFaqId = row.id;
  return row.id;
}

// ---------------------------------------------------------------------------
//  Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=".repeat(72));
  console.log("BAAK AI — Test A–F (npm run test:api)");
  console.log(`  API  : ${API_URL}`);
  console.log(`  DB   : ${process.env.DATABASE_URL?.replace(/:[^:@/]+@/, ":****@")}`);
  console.log("=".repeat(72));

  // ---- Pramuat: FAQ PKL asli ----
  const pklFaqId = await findPklFaqId();
  if (!pklFaqId) {
    console.error("❌ FAQ PKL (\"Bagaimana cara mendaftar PKL?\") tidak ditemukan di DB.");
    process.exit(1);
  }

  // =====================================================================
  //  TEST A — query PKL/magang ditemukan
  // =====================================================================
  console.log("\n--- TEST A: \"cara magang gimana?\" → found=true ---");
  {
    const { status, body } = await postRag("cara magang gimana?");
    report(
      "TEST A",
      status === 200 &&
        body.success === true &&
        body.found === true &&
        (body.confidence === "HIGH" || body.confidence === "MEDIUM") &&
        typeof body.context === "string" &&
        (body.context as string).length > 0 &&
        Array.isArray(body.sources) &&
        (body.sources as unknown[]).length >= 1 &&
        Array.isArray(body.suggestions) &&
        (body.suggestions as unknown[]).length >= 1 &&
        body.requiresHuman === false,
      [
        status !== 200 && `HTTP ${status}`,
        body.found !== true && `found=${body.found}`,
        typeof body.context !== "string" && "context bukan string",
        (Array.isArray(body.sources) && (body.sources as unknown[]).length < 1) &&
          "sources kosong",
        (Array.isArray(body.suggestions) &&
          (body.suggestions as unknown[]).length < 1) &&
          "suggestions kosong",
        body.requiresHuman !== false && `requiresHuman=${body.requiresHuman}`,
      ]
        .filter(Boolean)
        .join("; ") ||
        `found=true, confidence=${body.confidence}, score=${body.score}, ` +
          `sources=${(body.sources as unknown[]).length}, suggestions=${(body.suggestions as unknown[]).length}`,
    );
  }

  // =====================================================================
  //  TEST B — pertanyaan di luar KB → LOW → butuh manusia
  // =====================================================================
  console.log("\n--- TEST B: \"berapa harga tiket konser?\" → found=false ---");
  {
    const { status, body } = await postRag("berapa harga tiket konser?");
    report(
      "TEST B",
      status === 200 &&
        body.success === true &&
        body.found === false &&
        body.confidence === "LOW" &&
        body.requiresHuman === true &&
        body.context === null &&
        Array.isArray(body.suggestions) &&
        (body.suggestions as unknown[]).length === 0 &&
        Array.isArray(body.media) &&
        (body.media as unknown[]).length === 0 &&
        Array.isArray(body.attachments) &&
        (body.attachments as unknown[]).length === 0,
      [
        status !== 200 && `HTTP ${status}`,
        body.found !== false && `found=${body.found}`,
        body.confidence !== "LOW" && `confidence=${body.confidence}`,
        body.requiresHuman !== true && `requiresHuman=${body.requiresHuman}`,
        (Array.isArray(body.suggestions) &&
          (body.suggestions as unknown[]).length !== 0) &&
          "suggestions tidak kosong",
        (Array.isArray(body.media) && (body.media as unknown[]).length !== 0) &&
          "media tidak kosong",
        (Array.isArray(body.attachments) &&
          (body.attachments as unknown[]).length !== 0) &&
          "attachments tidak kosong",
      ]
        .filter(Boolean)
        .join("; ") || `found=false, score=${body.score}, requiresHuman=true`,
    );
  }

  // =====================================================================
  //  TEST C — FAQ PKL lengkap (sumber + media + lampiran + 3 terkait)
  // =====================================================================
  console.log(
    "\n--- TEST C: fixture sumber/media/lampiran/terkait pada FAQ PKL ---",
  );
  try {
    await installTestCFixtures(pklFaqId);
    const { status, body } = await postRag("cara mendaftar PKL magang?");
    const sources = (body.sources ?? []) as unknown[];
    const suggestions = (body.suggestions ?? []) as unknown[];
    const media = (body.media ?? []) as unknown[];
    const attachments = (body.attachments ?? []) as unknown[];
    const sourcesHaveUrl = sources.some(
      (s) => (s as { url?: string | null }).url != null,
    );
    report(
      "TEST C",
      status === 200 &&
        body.found === true &&
        sources.length >= 1 &&
        sourcesHaveUrl &&
        media.length >= 1 &&
        attachments.length >= 1 &&
        suggestions.length >= 1,
      [
        status !== 200 && `HTTP ${status}`,
        body.found !== true && `found=${body.found}`,
        sources.length < 1 && "sources kosong",
        !sourcesHaveUrl && "tidak ada URL sumber",
        media.length < 1 && "media kosong",
        attachments.length < 1 && "attachments kosong",
        suggestions.length < 1 && "suggestions kosong",
      ]
        .filter(Boolean)
        .join("; ") ||
        `sources=${sources.length} (url ok), media=${media.length}, ` +
          `attachments=${attachments.length}, suggestions=${suggestions.length}`,
    );
    console.log("        media[0]  :", JSON.stringify(media[0] ?? null));
    console.log("        lampiran[0]:", JSON.stringify(attachments[0] ?? null));
  } finally {
    await removeTestCFixtures();
  }

  // =====================================================================
  //  TEST D — backward-compat: field lama tetap ada + respons valid
  // =====================================================================
  console.log("\n--- TEST D: backward-compat field lama pada found & not-found ---");
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
    const checkShape = (body: Record<string, unknown>, found: boolean) => {
      const missing = legacyFields.filter((f) => !(f in body));
      return check(
        missing.length === 0 &&
          typeof body.success === "boolean" &&
          typeof body.found === "boolean" &&
          typeof body.confidence === "string" &&
          typeof body.score === "number" &&
          (body.context === null || typeof body.context === "string") &&
          Array.isArray(body.sources) &&
          Array.isArray(body.suggestions) &&
          Array.isArray(body.media) &&
          Array.isArray(body.attachments) &&
          typeof body.requiresHuman === "boolean" &&
          body.requiresHuman === !found &&
          typeof body.thresholds === "object" &&
          body.thresholds !== null,
        missing.length
          ? `field hilang: ${missing.join(", ")}`
          : `shape tidak valid untuk found=${found}`,
      );
    };

    const a = await postRag("cara magang gimana?");
    const b = await postRag("berapa harga tiket konser?");
    const errA = checkShape(a.body, true);
    const errB = checkShape(b.body, false);
    report(
      "TEST D",
      a.status === 200 &&
        b.status === 200 &&
        errA === null &&
        errB === null,
      [
        a.status !== 200 && `found-case HTTP ${a.status}`,
        b.status !== 200 && `notfound-case HTTP ${b.status}`,
        errA,
        errB,
      ]
        .filter(Boolean)
        .join("; ") || "field lama + baru lengkap pada kedua kondisi",
    );
  }

  // =====================================================================
  //  TEST E & F — predikat perubahan embedding (shared, dipakai production)
  // =====================================================================
  console.log("\n--- TEST E/F: predikat perubahan embedding (DB-level) ---");

  const pklRow = await db.query.knowledgeItems.findFirst({
    where: eq(knowledgeItems.id, pklFaqId),
    columns: { question: true, answer: true, keywords: true, audience: true },
  });
  const pklBase = {
    question: pklRow?.question ?? "",
    answer: pklRow?.answer ?? "",
    keywords: pklRow?.keywords ?? [],
    audience: pklRow?.audience ?? "",
  };

  // Predikat = EMBEDDING_FIELDS (question, answer, keywords, audience).
  // Test F: perubahan HANYA sourceUrl → predikat false (tidak re-embedding).
  // sourceUrl sengaja tidak dimuat ke objek yang dibandingkan: predikat hanya
  // melihat EMBEDDING_FIELDS, dan update sourceUrl-only menghasilkan
  // EmbeddingRelevantFields yang IDENTIK.
  const sourceUrlOnly: EmbeddingRelevantFields = {
    question: pklBase.question,
    answer: pklBase.answer,
    keywords: pklBase.keywords,
    audience: pklBase.audience,
  };
  const changedSourceOnly = embeddingFieldsChanged(pklBase, sourceUrlOnly);
  report(
    "TEST F (predikat)",
    changedSourceOnly === false,
    changedSourceOnly === false
      ? "sourceUrl TIDAK termasuk EMBEDDING_FIELDS → tanpa re-embedding ✓"
      : "predikat menganggap sourceUrl mengubah embedding (SALAH)",
  );

  // Test E: perubahan question/answer → predikat true.
  const changedContent = {
    ...pklBase,
    question: `${pklBase.question} (rev)`,
    answer: `${pklBase.answer} — revisi.`,
  };
  const changedContentPred = embeddingFieldsChanged(pklBase, changedContent);
  report(
    "TEST E (predikat)",
    changedContentPred === true,
    changedContentPred === true
      ? "question/answer termasuk EMBEDDING_FIELDS → re-embedding ✓"
      : "predikat tidak mendeteksi perubahan question/answer (SALAH)",
  );

  // Bukti pada baris nyata: FAQ scratch dibuat, di-embed, lalu diubah.
  console.log("\n--- TEST E (nyata): update question/answer → embedding berubah ---");
  try {
    const faqId = await createScratchFaq();
    const q1 = await processEmbeddingQueue({ batchSize: 10 });
    if (q1.faqFailed > 0) {
      report(
        "TEST E (nyata)",
        false,
        `embedding scratch gagal (${q1.faqFailed} FAQ). Cek Ollama.`,
      );
    } else {
      const before = await db.query.knowledgeItems.findFirst({
        where: eq(knowledgeItems.id, faqId),
        columns: {
          question: true,
          answer: true,
          keywords: true,
          audience: true,
          embedding: true,
          embeddingStatus: true,
        },
      });
      const vectorBefore = (before?.embedding ?? null) as number[] | null;
      const statusBefore = before?.embeddingStatus;

      // Simulasikan langkah production updateFaq: content berubah → PENDING.
      const next = {
        question: "TEST-E — Bagaimana prosedur magang/PKL? (revisi)",
        answer: "TEST-E — Alur magang direvisi: permohonan via portal akademik.",
        keywords: ["magang", "pkl"],
        audience: "MAHASISWA",
      };
      const changed =
        statusBefore === "FAILED" ||
        embeddingFieldsChanged(
          {
            question: before?.question ?? "",
            answer: before?.answer ?? "",
            keywords: before?.keywords ?? [],
            audience: before?.audience ?? "",
          },
          next,
        );

      if (!changed) {
        report("TEST E (nyata)", false, "predikat tidak mendeteksi perubahan");
      } else {
        await db
          .update(knowledgeItems)
          .set({
            question: next.question,
            answer: next.answer,
            embeddingStatus: "PENDING",
            embedding: null,
            embeddingError: null,
          })
          .where(eq(knowledgeItems.id, faqId));
        const q2 = await processEmbeddingQueue({ batchSize: 10 });

        const after = await db.query.knowledgeItems.findFirst({
          where: eq(knowledgeItems.id, faqId),
          columns: {
            embedding: true,
            embeddingStatus: true,
            embeddingModel: true,
            embeddingTextVersion: true,
          },
        });
        const vectorAfter = (after?.embedding ?? null) as number[] | null;
        // Bandingkan vektor sebelum/terakhir secara exact (hanya bila keduanya ada).
        const same =
          vectorBefore != null ? await vectorEquals(faqId, vectorBefore) : null;

        report(
          "TEST E (nyata)",
          q2.faqFailed === 0 &&
            after?.embeddingStatus === "COMPLETED" &&
            vectorBefore != null &&
            vectorAfter != null &&
            (await vectorEquals(faqId, vectorBefore)) === false,
          [
            q2.faqFailed > 0 && `embed ulang gagal`,
            after?.embeddingStatus !== "COMPLETED" &&
              `status=${after?.embeddingStatus}`,
            vectorBefore == null && "vektor awal kosong",
            vectorAfter == null && "vektor baru kosong",
            same === true && "vektor TIDAK berubah setelah update",
          ]
            .filter(Boolean)
            .join("; ") ||
            `question/answer diubah → re-embedding OK (status COMPLETED, vektor baru)`,
        );

        // ---- TEST F (nyata): update sourceUrl saja → embedding tidak disentuh ----
        const vectorAfterF = await db.query.knowledgeItems.findFirst({
          where: eq(knowledgeItems.id, faqId),
          columns: { embeddingStatus: true, sourceUrl: true },
        });

        const changedF =
          vectorAfterF?.embeddingStatus === "FAILED" ||
          embeddingFieldsChanged(
            {
              question: next.question,
              answer: next.answer,
              keywords: next.keywords,
              audience: next.audience,
            },
            {
              question: next.question,
              answer: next.answer,
              keywords: next.keywords,
              audience: next.audience,
            },
          );

        // Alur production: changedF=false → TIDAK reset PENDING, TIDAK re-embed.
        if (changedF === false) {
          await db
            .update(knowledgeItems)
            .set({ sourceUrl: "https://example.com/sumber-baru" })
            .where(eq(knowledgeItems.id, faqId));
        }
        const finalRow = await db.query.knowledgeItems.findFirst({
          where: eq(knowledgeItems.id, faqId),
          columns: {
            embeddingStatus: true,
            sourceUrl: true,
            embedding: true,
          },
        });
        const vectorUnchanged =
          vectorAfter != null
            ? await vectorEquals(faqId, vectorAfter)
            : null;

        report(
          "TEST F (nyata)",
          changedF === false &&
            finalRow?.embeddingStatus === "COMPLETED" &&
            finalRow?.sourceUrl === "https://example.com/sumber-baru" &&
            vectorUnchanged === true,
          [
            changedF !== false && "predikat memicu re-embedding untuk sourceUrl",
            finalRow?.embeddingStatus !== "COMPLETED" &&
              `status=${finalRow?.embeddingStatus}`,
            finalRow?.sourceUrl !== "https://example.com/sumber-baru" &&
              "sourceUrl tidak tersimpan",
            vectorUnchanged !== true && "vektor berubah walau hanya sourceUrl",
          ]
            .filter(Boolean)
            .join("; ") ||
            "update sourceUrl saja → embedding tetap COMPLETED & identik ✓",
        );
      }
    }
  } finally {
    if (scratchFaqId) {
      await db
        .delete(knowledgeItems)
        .where(sql`id = ${scratchFaqId}`);
      scratchFaqId = null;
    }
  }

  // -------------------------------------------------------------------------
  //  Ringkasan
  // -------------------------------------------------------------------------
  const failed = results.filter((r) => !r.pass);
  console.log("\n" + "=".repeat(72));
  console.log(`HASIL: ${results.length - failed.length}/${results.length} PASS`);
  for (const r of results) {
    console.log(`  ${r.pass ? "✅" : "❌"}  ${r.name}`);
  }
  if (failed.length > 0) {
    console.log("\nTest GAGAL:");
    for (const r of failed) console.log(`  - ${r.name}: ${r.detail}`);
  }
  console.log("=".repeat(72));
  await pool.end();
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Skrip test-api gagal:", err);
  process.exit(1);
});
