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

/** Kategori master (sesuai requirement). */
const CATEGORY_NAMES = [
  "PMB",
  "Registrasi",
  "KRS",
  "KHS",
  "Perkuliahan",
  "PKL",
  "Skripsi",
  "Cuti",
  "Aktif Kembali",
  "Wisuda",
  "Yudisium",
  "Beasiswa",
  "UKM",
  "Ormawa",
  "Surat Akademik",
  "Keuangan",
  "Administrasi",
  "Lainnya",
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
      description: "Peran sistem BAAK AI (demo).",
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
  const existingCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(knowledgeCategories);
  if ((existingCount[0]?.count ?? 0) > 0) {
    console.log("[seed] Categories sudah ada, dilewati.");
    return;
  }
  await db.insert(knowledgeCategories).values(
    CATEGORY_NAMES.map((name) => ({
      name,
      slug: slugify(name),
      description: null,
      isActive: true,
    })),
  );
  console.log(`[seed] Categories OK (${CATEGORY_NAMES.length} item).`);
}

async function seedSources() {
  const existing = await db
    .select({ id: knowledgeSources.id })
    .from(knowledgeSources)
    .where(eq(knowledgeSources.title, "Sumber Demo BAAK"))
    .limit(1);
  if (existing.length > 0) return;
  await db.insert(knowledgeSources).values({
    title: "Sumber Demo BAAK",
    type: "MANUAL",
    description:
      "Sumber DEMO untuk pengembangan. Data pada item ini bukan ketentuan resmi.",
    isActive: true,
  });
  console.log("[seed] Source demo dibuat.");
}

/** FAQ demo — KONTEN TIDAK NYATA, dilabeli DEMO, embedding PENDING. */
async function seedFaq() {
  const cats = await db.select().from(knowledgeCategories);

  const getCat = (name: string) =>
    cats.find((c) => c.name === name)?.id ?? null;

  const faqRows = [
    {
      categoryName: "PKL",
      question: "DEMO — Bagaimana prosedur PKL?",
      answer:
        "[DATA DEMO — BUKAN KETENTUAN RESMI]. Contoh alur PKL: mahasiswa mengajukan permohonan ke program studi, melengkapi berkas, lalu mengikuti briefing dari koordinator PKL. Konten ini hanya untuk pengembangan sistem; silakan ganti dengan ketentuan resmi sebelum digunakan.",
      audience: "MAHASISWA" as const,
      keywords: ["demo", "pkl", "contoh"],
    },
    {
      categoryName: "KRS",
      question: "DEMO — Kapan pengisian KRS dilakukan?",
      answer:
        "[DATA DEMO — BUKAN KETENTUAN RESMI]. Contoh: pengisian KRS umumnya dilakukan pada awal semester melalui portal akademik sesuai jadwal yang diumumkan fakultas. Konten ini hanya untuk pengembangan sistem.",
      audience: "MAHASISWA" as const,
      keywords: ["demo", "krs", "contoh"],
    },
    {
      categoryName: "Wisuda",
      question: "DEMO — Apa saja syarat wisuda?",
      answer:
        "[DATA DEMO — BUKAN KETENTUAN RESMI]. Contoh: syarat wisuda meliputi penyelesaian seluruh mata kuliah, bebas administrasi, dan pendaftaran wisuda. Konten ini hanya untuk pengembangan sistem.",
      audience: "MAHASISWA" as const,
      keywords: ["demo", "wisuda", "contoh"],
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
      // Embedding demo TIDAK dihitung di seed — dibiarkan PENDING agar
      // alur embed normal (via UI/retry) yang bekerja.
      embeddingStatus: "PENDING",
      embeddingTextVersion: EMBEDDING_TEXT_VERSION,
      internalNote:
        "DATA DEMO — dibuat oleh scripts/seed.ts untuk pengembangan. Hapus/ganti sebelum produksi.",
    });
    console.log(`[seed] FAQ demo: ${f.question}`);
  }
  console.log("[seed] FAQ demo OK (embedding PENDING).");
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
