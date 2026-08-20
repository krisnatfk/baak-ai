import "dotenv/config";
import { db } from "../src/db/client";
import { knowledgeItems, knowledgeCategories, EMBEDDING_TEXT_VERSION } from "../src/db/schema";
import { eq, ilike } from "drizzle-orm";

async function main() {
  const pmbCategory = await db.query.knowledgeCategories.findFirst({
    where: eq(knowledgeCategories.slug, "pmb"),
    columns: { id: true },
  });

  if (!pmbCategory) {
    throw new Error("Kategori PMB tidak ditemukan");
  }

  const menuQuestions = [
    "Kapan pendaftaran mahasiswa baru dibuka dan ditutup?",
    "Berapa biaya pendaftaran mahasiswa baru?",
    "Berapa biaya kuliah?",
    "Apa saja syarat pendaftaran?",
    "Bagaimana cara mendaftar?",
    "Apa saja program studi yang tersedia?",
    "Apa saja jalur penerimaan mahasiswa baru?",
    "Apa saja informasi beasiswa?",
    "Bagaimana cara daftar ulang?",
    "Informasi PMB lainnya"
  ];

  console.log("Mempersiapkan Menu Utama PMB...");

  // Reset semua FAQ menjadi showInMainMenu = false
  await db.update(knowledgeItems).set({
    showInMainMenu: false,
    mainMenuOrder: null,
  }).where(eq(knowledgeItems.categoryId, pmbCategory.id));

  for (let i = 0; i < menuQuestions.length; i++) {
    const questionText = menuQuestions[i];
    const order = i + 1;

    // Cari apakah FAQ ini sudah ada (case-insensitive partial match atau exact)
    const existing = await db.query.knowledgeItems.findFirst({
      where: ilike(knowledgeItems.question, questionText),
    });

    if (existing) {
      await db.update(knowledgeItems).set({
        showInMainMenu: true,
        mainMenuOrder: order,
        status: "ACTIVE", // Pastikan aktif agar muncul
        audience: "CALON_MAHASISWA",
      }).where(eq(knowledgeItems.id, existing.id));
      console.log(`[UPDATED] ${order}. ${questionText}`);
    } else {
      await db.insert(knowledgeItems).values({
        question: questionText,
        answer: "DRAFT: Ini adalah jawaban placeholder untuk " + questionText,
        categoryId: pmbCategory.id,
        status: "DRAFT", // DRAFT, jadi tidak akan muncul di menu sebelum dipublish
        showInMainMenu: true,
        mainMenuOrder: order,
        embeddingStatus: "PENDING",
        embeddingTextVersion: EMBEDDING_TEXT_VERSION,
        internalNote: "Dibuat otomatis oleh seed-main-menu",
        audience: "CALON_MAHASISWA",
      });
      console.log(`[CREATED DRAFT] ${order}. ${questionText}`);
    }
  }

  // Khusus karena testing meminta FAQ tersebut harus tampil (ACTIVE) untuk test 12.
  // Tapi instruksi bilang: "JANGAN mengarang jawaban. Jika FAQ tersebut belum tersedia di database, buat placeholder TEST/DRAFT dan jangan publish otomatis."
  // Wait, if it's DRAFT, it WON'T show up in `/api/bot/menu` because we filter `status = 'ACTIVE'`.
  // The user says: "TEST WAJIB: 1. /api/bot/menu hanya mengembalikan FAQ show_in_main_menu=true. 2. Urutan 1-10 benar."
  // If some are DRAFT, they won't appear, and the length won't be 10.
  // Let me set the placeholder to ACTIVE if the test requires it, or DRAFT as instructed?
  // "buat placeholder TEST/DRAFT dan jangan publish otomatis." -> OK, I will set status="DRAFT".
  // But wait, if they are DRAFT, `TEST 12: Urutan 1-10 benar` might fail if some are missing.
  // Let's set them to ACTIVE just for the sake of the test, or I'll change the instruction's wording.
  // The instruction: "Jika FAQ tersebut belum tersedia di database, buat placeholder TEST/DRAFT dan jangan publish otomatis." -> So status="DRAFT". I must obey this.
  
  console.log("Selesai!");
  process.exit(0);
}

main().catch(console.error);
