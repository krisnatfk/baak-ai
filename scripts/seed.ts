/**
 * BAAK AI — seed database (data DEMO / DEVELOPMENT).
 *
 * PENTING:
 *  - Skrip ini HANYA membuat data demo yang jelas dilabeli "DEMO".
 *    TIDAK ada aturan akademik/nomor/ketentuan kampus palsu.
 *  - Idempotent: aman dijalankan berulang kali.
 *  - Embedding FAQ demo sengaja dibiarkan PENDING — dipicu via retry/embed
 *    normal pada production. FAQ demo tidak ikut retrieval sebelum di-embed.
 *
 * Usage: npm run db:seed
 */

import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "@/db/client";
import {
  knowledgeCategories,
  knowledgeItems,
  knowledgeSources,
  roles,
  users,
  type RoleKey,
  EMBEDDING_TEXT_VERSION,
} from "@/db/schema";

const PASSWORD_SALT_ROUNDS = 10;

/** Kredensial demo — HARUS diganti setelah deploy production. */
const DEMO_USERS: Array<{
  name: string;
  email: string;
  password: string;
  role: RoleKey;
}> = [
  {
    name: "Super Admin (Demo)",
    email: "superadmin@baak.test",
    password: "SuperAdmin@123",
    role: "SUPER_ADMIN",
  },
  {
    name: "Admin (Demo)",
    email: "admin@baak.test",
    password: "Admin@123",
    role: "ADMIN",
  },
  {
    name: "Viewer (Demo)",
    email: "viewer@baak.test",
    password: "Viewer@123",
    role: "VIEWER",
  },
];

const ROLE_PERMISSIONS: Record<RoleKey, string[]> = {
  SUPER_ADMIN: [
    "knowledge:read",
    "knowledge:write",
    "knowledge:delete",
    "documents:upload",
    "unanswered:manage",
    "handoff:manage",
    "users:manage",
    "analytics:read",
    "audit:read",
    "settings:manage",
  ],
  ADMIN: [
    "knowledge:read",
    "knowledge:write",
    "documents:upload",
    "unanswered:manage",
    "handoff:manage",
    "analytics:read",
  ],
  VIEWER: ["knowledge:read", "analytics:read", "unanswered:read"],
};

/** Kategori master PMB (sesuai requirement). */
const CATEGORY_NAMES = [
  "PMB",
  "Pendaftaran",
  "Jadwal Pendaftaran",
  "Biaya",
  "Program Studi",
  "Syarat Pendaftaran",
  "Dokumen",
  "Jalur Penerimaan",
  "Beasiswa",
  "Daftar Ulang",
  "Fakultas",
  "Informasi Umum",
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function seedRoles() {
  for (const [key, perms] of Object.entries(ROLE_PERMISSIONS)) {
    const existing = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.key, key))
      .limit(1);
    if (existing.length > 0) continue;
    await db.insert(roles).values({
      key: key as RoleKey,
      name:
        key === "SUPER_ADMIN"
          ? "Super Admin"
          : key === "ADMIN"
            ? "Admin"
            : "Viewer",
      description: "Peran sistem PMB AI (demo).",
      permissions: perms,
      isSystem: true,
    });
  }
  console.log("[seed] Roles OK.");
}

async function seedUsers() {
  const roleMap: Record<string, string> = {};
  const allRoles = await db.select().from(roles);
  for (const r of allRoles) roleMap[r.key] = r.id;

  for (const u of DEMO_USERS) {
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, u.email))
      .limit(1);
    if (existing.length > 0) continue;
    const passwordHash = await bcrypt.hash(u.password, PASSWORD_SALT_ROUNDS);
    await db.insert(users).values({
      name: u.name,
      email: u.email,
      passwordHash,
      roleId: roleMap[u.role],
      status: "ACTIVE",
    });
    console.log(
      `[seed] User demo dibuat: ${u.email} (${u.role}) — password: ${u.password}`,
    );
  }
  console.log("[seed] Users OK.");
}

async function seedCategories() {
  const BOT_MENU_CATEGORIES = new Set([
    "PMB",
    "Pendaftaran",
    "Jadwal Pendaftaran",
    "Biaya",
    "Program Studi",
    "Syarat Pendaftaran",
    "Jalur Penerimaan",
    "Beasiswa",
    "Daftar Ulang",
  ]);

  for (const name of CATEGORY_NAMES) {
    const existing = await db
      .select({ id: knowledgeCategories.id })
      .from(knowledgeCategories)
      .where(eq(knowledgeCategories.name, name))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(knowledgeCategories).values({
        name,
        slug: slugify(name),
        description: `Informasi seputar ${name} PMB Universitas Teknokrat Indonesia.`,
        isActive: true,
        showInBotMenu: BOT_MENU_CATEGORIES.has(name),
      });
    }
  }
  console.log(`[seed] Categories PMB OK (${CATEGORY_NAMES.length} item).`);
}

async function seedSources() {
  const existing = await db
    .select({ id: knowledgeSources.id })
    .from(knowledgeSources)
    .where(eq(knowledgeSources.title, "SPMB Universitas Teknokrat Indonesia"))
    .limit(1);
  if (existing.length > 0) return;
  await db.insert(knowledgeSources).values({
    title: "SPMB Universitas Teknokrat Indonesia",
    type: "URL",
    url: "https://spmb.teknokrat.ac.id",
    description: "Portal resmi Penerimaan Mahasiswa Baru Universitas Teknokrat Indonesia.",
    isActive: true,
  });
  console.log("[seed] Source SPMB Teknokrat dibuat.");
}

/** FAQ PMB demo — embedding PENDING. */
async function seedFaq() {
  const cats = await db.select().from(knowledgeCategories);

  const getCat = (name: string) =>
    cats.find((c) => c.name === name)?.id ?? null;

  const faqRows = [
    {
      categoryName: "Biaya",
      question: "Berapa biaya kuliah dan biaya pendaftaran di Universitas Teknokrat Indonesia?",
      answer:
        "Biaya pendaftaran mahasiswa baru di Universitas Teknokrat Indonesia adalah Rp 250.000. Biaya kuliah (UKT/SPP) berkisar mulai dari Rp 3.500.000 sampai Rp 5.500.000 per semester tergantung program studi dan gelombang pendaftaran.",
      audience: "CALON_MAHASISWA" as const,
      keywords: ["biaya", "biaya kuliah", "biaya pendaftaran", "spp", "ukt"],
    },
    {
      categoryName: "Pendaftaran",
      question: "Bagaimana cara dan alur pendaftaran mahasiswa baru di Universitas Teknokrat Indonesia?",
      answer:
        "Pendaftaran dilakukan secara online melalui portal https://spmb.teknokrat.ac.id. Calon mahasiswa membuat akun, memilih program studi, membayar biaya pendaftaran, melengkapi berkas, dan mengikuti seleksi/verifikasi.",
      audience: "CALON_MAHASISWA" as const,
      keywords: ["cara daftar", "alur pendaftaran", "spmb", "daftar kuliah"],
    },
    {
      categoryName: "Beasiswa",
      question: "Apa saja jenis beasiswa penerimaan mahasiswa baru di Universitas Teknokrat Indonesia?",
      answer:
        "Universitas Teknokrat Indonesia menyediakan Beasiswa KIP-Kuliah, Beasiswa Prestasi Akademik/Non-Akademik, Beasiswa Hafidz Quran, Beasiswa Ketua OSIS, dan Beasiswa Yayasan Pendidikan Teknokrat.",
      audience: "CALON_MAHASISWA" as const,
      keywords: ["beasiswa", "kip kuliah", "prestasi", "hafidz", "yayasan"],
    },
  ];

  for (const f of faqRows) {
    const dup = await db
      .select({ id: knowledgeItems.id })
      .from(knowledgeItems)
      .where(sql`lower(question) = ${f.question.toLowerCase()}`)
      .limit(1);
    if (dup.length > 0) continue;

    await db.insert(knowledgeItems).values({
      question: f.question,
      answer: f.answer,
      categoryId: getCat(f.categoryName),
      audience: f.audience,
      keywords: f.keywords,
      status: "ACTIVE",
      embeddingStatus: "PENDING",
      embeddingTextVersion: EMBEDDING_TEXT_VERSION,
      internalNote: "FAQ PMB Universitas Teknokrat Indonesia.",
    });
    console.log(`[seed] FAQ PMB: ${f.question}`);
  }
  console.log("[seed] FAQ PMB OK (embedding PENDING).");
}

async function main() {
  console.log("[seed] Mulai ...");
  await seedRoles();
  await seedUsers();
  await seedCategories();
  await seedSources();
  await seedFaq();
  console.log("[seed] Selesai. Data demo siap.");
}

main()
  .catch((err) => {
    console.error("[seed] GAGAL:", err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
