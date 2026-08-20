/**
 * scripts/migrate-pmb.ts — Migrasi Knowledge Base ke PMB Universitas Teknokrat Indonesia.
 *
 * Tugas:
 * 1. Mengubah status FAQ mahasiswa aktif lama (PKL, KRS, Wisuda, KHS, Cuti, dll.) menjadi INACTIVE.
 * 2. Memastikan seluruh kategori PMB resmi ada dan terkonfigurasi (showInBotMenu = true).
 * 3. Menonaktifkan showInBotMenu pada kategori legacy mahasiswa aktif.
 * 4. Mengaktifkan FAQ PMB yang valid dan menambahkan FAQ PMB esensial.
 * 5. Menghitung embedding untuk seluruh FAQ PMB yang belum di-embed.
 *
 * Usage: npx tsx -r dotenv/config scripts/migrate-pmb.ts
 */

import "dotenv/config";

// Dari host, Ollama diakses via localhost jika sebelumnya host.docker.internal
if (process.env.EMBEDDING_PROVIDER === "openai-compatible" && process.env.EMBEDDING_BASE_URL?.includes("host.docker.internal")) {
  process.env.EMBEDDING_BASE_URL = "http://localhost:11434/v1";
}

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, pool } from "@/db/client";
import {
  knowledgeCategories,
  knowledgeItems,
  knowledgeSources,
  EMBEDDING_TEXT_VERSION,
} from "@/db/schema";
import { processEmbeddingQueue } from "@/services/embedding/worker";

const PMB_CATEGORIES = [
  { name: "PMB", showInBotMenu: true, desc: "Informasi umum Penerimaan Mahasiswa Baru" },
  { name: "Pendaftaran", showInBotMenu: true, desc: "Tata cara dan alur pendaftaran mahasiswa baru" },
  { name: "Jadwal Pendaftaran", showInBotMenu: true, desc: "Jadwal gelombang dan batas akhir pendaftaran" },
  { name: "Biaya", showInBotMenu: true, desc: "Informasi biaya pendaftaran, UKT, dan biaya kuliah" },
  { name: "Program Studi", showInBotMenu: true, desc: "Daftar program studi dan akreditasi" },
  { name: "Syarat Pendaftaran", showInBotMenu: true, desc: "Persyaratan umum dan khusus calon mahasiswa" },
  { name: "Dokumen", showInBotMenu: true, desc: "Berkas dan dokumen persyaratan pendaftaran" },
  { name: "Jalur Penerimaan", showInBotMenu: true, desc: "Jalur reguler, prestasi, beasiswa, dan transfer" },
  { name: "Beasiswa", showInBotMenu: true, desc: "Beasiswa KIP-Kuliah, Yayasan, Prestasi, dan Mitra" },
  { name: "Daftar Ulang", showInBotMenu: true, desc: "Prosedur, syarat, dan konfirmasi registrasi ulang" },
  { name: "Fakultas", showInBotMenu: true, desc: "Fakultas Teknik & Ilmu Komputer, FEB, FSIP" },
  { name: "Informasi Umum", showInBotMenu: false, desc: "Informasi seputar kampus Universitas Teknokrat Indonesia" },
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function migrateLegacyFaq() {
  console.log("[migrate-pmb] 1. Mengarsipkan FAQ legacy mahasiswa aktif (PKL, KRS, Wisuda, dll)...");

  // Nonaktifkan FAQ dengan audiens MAHASISWA atau ALUMNI
  await db
    .update(knowledgeItems)
    .set({ status: "INACTIVE" })
    .where(
      and(
        inArray(knowledgeItems.audience, ["MAHASISWA", "ALUMNI"]),
        eq(knowledgeItems.status, "ACTIVE"),
      ),
    );

  // Nonaktifkan FAQ yang mengandung kata kunci mahasiswa aktif lama
  const legacyKeywords = ["pkl", "krs", "wisuda", "khs", "cuti", "yudisium", "skripsi", "magang"];
  for (const kw of legacyKeywords) {
    await db.execute(
      sql`UPDATE knowledge_items SET status = 'INACTIVE' 
          WHERE status = 'ACTIVE' 
          AND (lower(question) LIKE ${`%${kw}%`} OR lower(answer) LIKE ${`%${kw}%`})`,
    );
  }

  console.log("[migrate-pmb] FAQ legacy berhasil diubah statusnya menjadi INACTIVE.");
}

async function updateCategories() {
  console.log("[migrate-pmb] 2. Memperbarui kategori PMB...");

  // Nonaktifkan showInBotMenu pada kategori lama
  const legacyCatNames = ["PKL", "KRS", "Wisuda", "KHS", "Cuti", "Aktif Kembali", "Yudisium", "Skripsi", "Perkuliahan", "Surat Akademik"];
  for (const name of legacyCatNames) {
    await db
      .update(knowledgeCategories)
      .set({ showInBotMenu: false })
      .where(eq(knowledgeCategories.name, name));
  }

  // Pastikan kategori PMB ada
  const catMap = new Map<string, string>();
  for (const cat of PMB_CATEGORIES) {
    const existing = await db
      .select({ id: knowledgeCategories.id })
      .from(knowledgeCategories)
      .where(eq(knowledgeCategories.name, cat.name))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(knowledgeCategories)
        .set({
          showInBotMenu: cat.showInBotMenu,
          isActive: true,
          description: cat.desc,
        })
        .where(eq(knowledgeCategories.id, existing[0].id));
      catMap.set(cat.name, existing[0].id);
    } else {
      const inserted = await db
        .insert(knowledgeCategories)
        .values({
          name: cat.name,
          slug: slugify(cat.name),
          description: cat.desc,
          isActive: true,
          showInBotMenu: cat.showInBotMenu,
        })
        .returning({ id: knowledgeCategories.id });
      catMap.set(cat.name, inserted[0].id);
    }
  }

  console.log("[migrate-pmb] Kategori PMB siap.");
  return catMap;
}

async function ensureSources() {
  console.log("[migrate-pmb] 3. Memastikan sumber PMB resmi...");
  const existing = await db
    .select({ id: knowledgeSources.id })
    .from(knowledgeSources)
    .where(eq(knowledgeSources.title, "SPMB Universitas Teknokrat Indonesia"))
    .limit(1);

  if (existing.length > 0) return existing[0].id;

  const inserted = await db
    .insert(knowledgeSources)
    .values({
      title: "SPMB Universitas Teknokrat Indonesia",
      type: "URL",
      url: "https://spmb.teknokrat.ac.id",
      description: "Portal resmi Penerimaan Mahasiswa Baru Universitas Teknokrat Indonesia",
      isActive: true,
    })
    .returning({ id: knowledgeSources.id });

  return inserted[0].id;
}

const PMB_CORE_FAQS = [
  {
    category: "Biaya",
    question: "Berapa biaya kuliah dan biaya pendaftaran di Universitas Teknokrat Indonesia?",
    answer:
      "Biaya pendaftaran mahasiswa baru di Universitas Teknokrat Indonesia adalah Rp 250.000 (dapat bebas biaya pendaftaran melalui jalur beasiswa/promo tertentu). Rincian biaya kuliah (UKT/SPP) berkisar mulai dari Rp 3.500.000 hingga Rp 5.500.000 per semester tergantung program studi yang dipilih dan gelombang pendaftaran. Pembayaran biaya kuliah dapat diangsur sesuai ketentuan bagian keuangan PMB.",
    audience: "CALON_MAHASISWA" as const,
    keywords: ["biaya", "biaya kuliah", "biaya pendaftaran", "ukt", "spp", "angsuran", "uang kuliah"],
    alternatives: [
      "info biaya kuliah",
      "biaya pendaftaran berapa?",
      "berapa spp per semester?",
      "rincian biaya kuliah teknokrat",
      "apakah biaya kuliah bisa dicicil?",
    ],
  },
  {
    category: "Pendaftaran",
    question: "Bagaimana cara dan alur pendaftaran mahasiswa baru di Universitas Teknokrat Indonesia?",
    answer:
      "Alur pendaftaran mahasiswa baru Universitas Teknokrat Indonesia:\n1. Buka portal pendaftaran online di https://spmb.teknokrat.ac.id\n2. Buat akun pendaftaran dengan mengisi data diri, nomor WhatsApp aktif, dan email.\n3. Pilih program studi dan jalur penerimaan yang diinginkan.\n4. Lakukan pembayaran biaya pendaftaran melalui transfer bank/virtual account.\n5. Lengkapi biodata dan unggah dokumen persyaratan.\n6. Ikuti tes online / verifikasi berkas.\n7. Pengumuman kelulusan dan lakukan daftar ulang.",
    audience: "CALON_MAHASISWA" as const,
    keywords: ["cara daftar", "alur pendaftaran", "daftar kuliah", "spmb", "prosedur pendaftaran"],
    alternatives: [
      "cara daftar kuliah",
      "bagaimana cara mendaftar di teknokrat?",
      "tata cara pendaftaran mahasiswa baru",
      "alur pendaftaran online",
      "daftar online teknokrat",
    ],
  },
  {
    category: "Jadwal Pendaftaran",
    question: "Kapan jadwal dan batas pendaftaran mahasiswa baru dibuka dan ditutup?",
    answer:
      "Penerimaan Mahasiswa Baru Universitas Teknokrat Indonesia dibuka dalam beberapa gelombang:\n- Gelombang Dini / Prestasi: Oktober – Desember\n- Gelombang 1: Januari – Maret\n- Gelombang 2: April – Juni\n- Gelombang 3: Juli – September\nSetiap gelombang memiliki kuota dan penawaran potongan biaya khusus. Pendaftaran akan ditutup otomatis apabila kuota program studi telah terpenuhi.",
    audience: "CALON_MAHASISWA" as const,
    keywords: ["jadwal", "batas pendaftaran", "kapan ditutup", "gelombang pendaftaran", "deadline pendaftaran"],
    alternatives: [
      "kapan pendaftaran ditutup",
      "jadwal pendaftaran pmb",
      "sampai kapan pendaftaran dibuka?",
      "batas akhir pendaftaran teknokrat",
      "kapan gelombang 2 ditutup?",
    ],
  },
  {
    category: "Beasiswa",
    question: "Apa saja jenis beasiswa penerimaan mahasiswa baru di Universitas Teknokrat Indonesia?",
    answer:
      "Universitas Teknokrat Indonesia menyediakan berbagai program beasiswa bagi calon mahasiswa baru, antara lain:\n1. Beasiswa KIP-Kuliah (Kartu Indonesia Pintar Kuliah) - Bebas biaya kuliah dan uang saku dari pemerintah.\n2. Beasiswa Prestasi Akademik & Non-Akademik (Juara Olahraga, Seni, Robotik, LKS/OSN).\n3. Beasiswa Hafidz Quran (Penghafal Al-Quran minimal 3 Juz).\n4. Beasiswa Ketua OSIS / Kepemimpinan Sekolah.\n5. Beasiswa Yayasan Pendidikan Teknokrat & Beasiswa Mitra Korporasi.\nInformasi pendaftaran beasiswa dapat diakses di portal SPMB atau menghubungi bagian beasiswa PMB.",
    audience: "CALON_MAHASISWA" as const,
    keywords: ["beasiswa", "kip kuliah", "beasiswa prestasi", "hafidz quran", "beasiswa yayasan", "potongan biaya"],
    alternatives: [
      "beasiswa",
      "ada beasiswa apa saja?",
      "info beasiswa teknokrat",
      "syarat beasiswa kip kuliah",
      "bagaimana cara dapat beasiswa kuliah?",
    ],
  },
  {
    category: "Syarat Pendaftaran",
    question: "Apa saja syarat dan dokumen yang dibutuhkan untuk mendaftar mahasiswa baru di Universitas Teknokrat Indonesia?",
    answer:
      "Syarat umum pendaftaran mahasiswa baru:\n1. Lulusan SMA/SMK/MA/sederajat semua jurusan atau paket C.\n2. Mengisi formulir pendaftaran online di https://spmb.teknokrat.ac.id.\n\nDokumen yang perlu diunggah:\n- Pasfoto berwarna terbaru (format JPG/PNG)\n- Scan Kartu Keluarga (KK) dan KTP / Kartu Pelajar\n- Scan Ijazah atau Surat Keterangan Lulus (SKL) / Rapor semester terakhir bagi yang belum lulus\n- Sertifikat prestasi / piagam penghargaan (khusus jalur beasiswa/prestasi).",
    audience: "CALON_MAHASISWA" as const,
    keywords: ["syarat", "syarat pendaftaran", "dokumen pendaftaran", "berkas pendaftaran", "persyaratan daftar"],
    alternatives: [
      "syarat daftar",
      "apa saja syarat pendaftaran?",
      "berkas yang harus disiapkan untuk daftar",
      "dokumen apa saja untuk daftar kuliah?",
      "persyaratan masuk teknokrat",
    ],
  },
  {
    category: "Program Studi",
    question: "Apa saja fakultas dan program studi yang tersedia di Universitas Teknokrat Indonesia?",
    answer:
      "Universitas Teknokrat Indonesia memiliki 3 Fakultas dengan program studi unggulan terakreditasi Unggul/Baik Sekali:\n\n1. Fakultas Teknik dan Ilmu Komputer (FTIK):\n   - S1 Informatika\n   - S1 Sistem Informasi\n   - S1 Teknologi Informasi\n   - S1 Teknik Elektro\n   - S1 Teknik Sipil\n   - D3 Sistem Informasi Akuntansi\n\n2. Fakultas Ekonomi dan Bisnis (FEB):\n   - S1 Manajemen\n   - S1 Akuntansi\n\n3. Fakultas Sastra dan Ilmu Pendidikan (FSIP):\n   - S1 Sastra Inggris\n   - S1 Pendidikan Bahasa Inggris\n   - S1 Pendidikan Matematika\n   - S1 Pendidikan Olahraga",
    audience: "CALON_MAHASISWA" as const,
    keywords: ["program studi", "jurusan", "fakultas", "prodi", "ftik", "feb", "fsip", "informatika", "sistem informasi"],
    alternatives: [
      "jurusan apa saja yang ada di teknokrat?",
      "program studi teknokrat",
      "daftar fakultas dan jurusan",
      "prodi di teknokrat",
      "apakah ada jurusan teknik informatika?",
    ],
  },
  {
    category: "Daftar Ulang",
    question: "Bagaimana cara dan ketentuan daftar ulang mahasiswa baru Universitas Teknokrat Indonesia?",
    answer:
      "Setelah dinyatakan lulus seleksi PMB, calon mahasiswa wajib melakukan daftar ulang dengan langkah:\n1. Login ke akun pendaftaran di https://spmb.teknokrat.ac.id.\n2. Cek tagihan dan lakukan pembayaran daftar ulang (UKT tahap awal) sesuai invoice.\n3. Unggah bukti pembayaran dan lengkapi berkas verifikasi final.\n4. Calon mahasiswa akan mendapatkan Nomor Pokok Mahasiswa (NPM) resmi dan jadwal pengenalan kampus (PKKMB).",
    audience: "CALON_MAHASISWA" as const,
    keywords: ["daftar ulang", "registrasi ulang", "registrasi", "npm", "pkkmb"],
    alternatives: [
      "cara daftar ulang",
      "bagaimana proses registrasi ulang?",
      "kapan daftar ulang dilakukan?",
      "syarat daftar ulang mahasiswa baru",
    ],
  },
  {
    category: "Jalur Penerimaan",
    question: "Apa saja jalur penerimaan mahasiswa baru di Universitas Teknokrat Indonesia?",
    answer:
      "Universitas Teknokrat Indonesia membuka beberapa jalur penerimaan mahasiswa baru:\n1. Jalur Reguler (Tes Online Potensi Akademik).\n2. Jalur Rapor & Prestasi (Tanpa Tes tertulis, berdasarkan nilai rapor atau piagam juara).\n3. Jalur Beasiswa (KIP Kuliah, Beasiswa Yayasan, Hafidz Quran).\n4. Jalur Alih Jenjang / Pindahan (Transfer dari D3 ke S1 atau pindahan antar-perguruan tinggi).",
    audience: "CALON_MAHASISWA" as const,
    keywords: ["jalur penerimaan", "jalur masuk", "jalur reguler", "jalur prestasi", "jalur transfer"],
    alternatives: [
      "jalur masuk teknokrat",
      "apa saja jalur penerimaan?",
      "apakah ada jalur tanpa tes?",
      "jalur rapor teknokrat",
    ],
  },
];

async function seedPmbFaqs(catMap: Map<string, string>, sourceId: string) {
  console.log("[migrate-pmb] 4. Memperbarui dan mengaktifkan FAQ PMB...");

  // Aktifkan juga FAQ PMB yang sebelumnya berstatus NEEDS_REVIEW jika audiens CALON_MAHASISWA
  await db
    .update(knowledgeItems)
    .set({ status: "ACTIVE" })
    .where(
      and(
        eq(knowledgeItems.audience, "CALON_MAHASISWA"),
        isNull(knowledgeItems.deletedAt),
      ),
    );

  for (const item of PMB_CORE_FAQS) {
    const categoryId = catMap.get(item.category) ?? null;
    const existing = await db
      .select({ id: knowledgeItems.id })
      .from(knowledgeItems)
      .where(sql`lower(question) = ${item.question.toLowerCase()}`)
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(knowledgeItems)
        .set({
          answer: item.answer,
          categoryId,
          sourceId,
          audience: item.audience,
          keywords: item.keywords,
          status: "ACTIVE",
          embeddingStatus: "PENDING", // trigger re-embed
          embeddingTextVersion: EMBEDDING_TEXT_VERSION,
        })
        .where(eq(knowledgeItems.id, existing[0].id));
      console.log(`[migrate-pmb] FAQ di-update: ${item.question}`);
    } else {
      await db.insert(knowledgeItems).values({
        question: item.question,
        answer: item.answer,
        categoryId,
        sourceId,
        audience: item.audience,
        keywords: item.keywords,
        status: "ACTIVE",
        embeddingStatus: "PENDING",
        embeddingTextVersion: EMBEDDING_TEXT_VERSION,
      });
      console.log(`[migrate-pmb] FAQ baru ditambahkan: ${item.question}`);
    }
  }
}

async function processEmbeddings() {
  console.log("[migrate-pmb] 5. Menghitung embedding untuk FAQ PMB aktif...");
  try {
    const stats = await processEmbeddingQueue({ batchSize: 50 });
    console.log(`[migrate-pmb] Embedding queue selesai: FAQ diproses=${stats.faqProcessed}, FAQ gagal=${stats.faqFailed}`);
  } catch (err) {
    console.error("[migrate-pmb] Peringatan: gagal memproses antrean embedding otomatis:", err);
  }
}

async function main() {
  console.log("=================================================");
  console.log("Mulai Migrasi Knowledge Base ke PMB Teknokrat...");
  console.log("=================================================");

  await migrateLegacyFaq();
  const catMap = await updateCategories();
  const sourceId = await ensureSources();
  await seedPmbFaqs(catMap, sourceId);
  await processEmbeddings();

  console.log("=================================================");
  console.log("Migrasi Knowledge PMB Selesai Sukses!");
  console.log("=================================================");
}

main()
  .catch((err) => {
    console.error("[migrate-pmb] GAGAL:", err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
