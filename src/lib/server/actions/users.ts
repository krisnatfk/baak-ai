/**
 * Server Actions — manajemen pengguna (SUPER_ADMIN).
 *
 * Semua mutasi:
 *  - divalidasi zod (parameterized, aman dari injection),
 *  - dilindungi role (hanya SUPER_ADMIN),
 *  - password disimpan sebagai hash bcrypt (tidak pernah plaintext),
 *  - dicatat ke audit_logs (entity USER),
 *  - melindungi akun sendiri dan SUPER_ADMIN terakhir dari terkunci.
 */

"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db/client";
import { roles, users } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { requireRole } from "@/lib/guards";
import {
  createUserSchema,
  updateUserSchema,
  type UserStatusValue,
} from "@/lib/users-schema";
import { type ActionResult, fail, isUniqueViolation, ok, zodFail } from "./shared";

export type { ActionResult } from "./shared";

const BCRYPT_ROUNDS = 12;

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * Jumlah SUPER_ADMIN aktif, tanpa menghitung `excludeUserId`.
 * Dipakai agar akun SUPER_ADMIN terakhir tidak bisa dinonaktifkan/diturunkan.
 */
async function countActiveSuperAdmins(excludeUserId: string): Promise<number> {
  const superRole = await db.query.roles.findFirst({
    where: eq(roles.key, "SUPER_ADMIN"),
    columns: { id: true },
  });
  if (!superRole) return 0;

  const rows = await db.query.users.findMany({
    where: (t, { and: a, eq: e }) =>
      a(e(t.roleId, superRole.id), e(t.status, "ACTIVE")),
    columns: { id: true },
  });
  return rows.filter((r) => r.id !== excludeUserId).length;
}

// ---------------------------------------------------------------------------
// Buat pengguna
// ---------------------------------------------------------------------------

export async function createUser(input: unknown): Promise<ActionResult> {
  const user = await requireRole("SUPER_ADMIN");
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const data = parsed.data;

  const role = await db.query.roles.findFirst({
    where: eq(roles.id, data.roleId),
    columns: { id: true, key: true, name: true },
  });
  if (!role) return fail("Peran tidak ditemukan.");

  try {
    const [row] = await db
      .insert(users)
      .values({
        name: data.name,
        email: data.email,
        passwordHash: await bcrypt.hash(data.password, BCRYPT_ROUNDS),
        roleId: role.id,
        status: "ACTIVE",
      })
      .returning({ id: users.id });

    await logAudit({
      user,
      action: "CREATE",
      entity: "USER",
      entityId: row.id,
      newData: {
        name: data.name,
        email: data.email,
        role: role.key,
        status: "ACTIVE",
      },
    });
    revalidatePath("/users");
    return ok("Pengguna berhasil dibuat.", row.id);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return fail("Email sudah terdaftar. Gunakan email lain.");
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Perbarui pengguna
// ---------------------------------------------------------------------------

export async function updateUser(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const actor = await requireRole("SUPER_ADMIN");
  const parsed = updateUserSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const data = parsed.data;

  const existing = await db.query.users.findFirst({
    where: eq(users.id, id),
    columns: { id: true, name: true, email: true, roleId: true, status: true },
    with: { role: { columns: { key: true } } },
  });
  if (!existing) return fail("Pengguna tidak ditemukan.");

  const isSelf = existing.id === actor.id;
  const roleChanged = existing.roleId !== data.roleId;

  // Jangan biarkan admin mengunci diri sendiri dari panel.
  if (isSelf && roleChanged) {
    return fail("Tidak dapat mengubah peran akun sendiri.");
  }
  if (isSelf && data.status === "INACTIVE") {
    return fail("Tidak dapat menonaktifkan akun sendiri.");
  }

  const newRole = await db.query.roles.findFirst({
    where: eq(roles.id, data.roleId),
    columns: { id: true, key: true, name: true },
  });
  if (!newRole) return fail("Peran tidak ditemukan.");

  // Pertahankan minimal satu SUPER_ADMIN aktif.
  const isSuperAdmin = existing.role?.key === "SUPER_ADMIN";
  if (isSuperAdmin && newRole.key !== "SUPER_ADMIN") {
    const remaining = await countActiveSuperAdmins(id);
    if (remaining === 0) {
      return fail(
        "Tidak dapat menurunkan peran SUPER_ADMIN terakhir. Minimal satu SUPER_ADMIN aktif harus tetap ada.",
      );
    }
  }

  const hasNewPassword = data.password.length > 0;
  const [row] = await db
    .update(users)
    .set({
      name: data.name,
      email: data.email,
      roleId: newRole.id,
      status: data.status,
      ...(hasNewPassword
        ? { passwordHash: await bcrypt.hash(data.password, BCRYPT_ROUNDS) }
        : {}),
    })
    .where(eq(users.id, id))
    .returning({ id: users.id });

  await logAudit({
    user: actor,
    action: "UPDATE",
    entity: "USER",
    entityId: row.id,
    oldData: {
      name: existing.name,
      email: existing.email,
      role: existing.role?.key,
      status: existing.status,
    },
    newData: {
      name: data.name,
      email: data.email,
      role: newRole.key,
      status: data.status,
      passwordReset: hasNewPassword,
    },
  });
  revalidatePath("/users");
  return ok("Pengguna berhasil diperbarui.", row.id);
}

// ---------------------------------------------------------------------------
// Aktifkan / nonaktifkan
// ---------------------------------------------------------------------------

export async function setUserStatus(
  id: string,
  status: UserStatusValue,
): Promise<ActionResult> {
  const actor = await requireRole("SUPER_ADMIN");
  if (status !== "ACTIVE" && status !== "INACTIVE") {
    return fail("Status tidak valid.");
  }

  const existing = await db.query.users.findFirst({
    where: eq(users.id, id),
    columns: { id: true, name: true, status: true },
    with: { role: { columns: { key: true } } },
  });
  if (!existing) return fail("Pengguna tidak ditemukan.");
  if (existing.id === actor.id) {
    return fail("Tidak dapat mengubah status akun sendiri.");
  }
  if (existing.status === status) {
    return fail(
      status === "ACTIVE" ? "Pengguna sudah aktif." : "Pengguna sudah nonaktif.",
    );
  }

  // Pertahankan minimal satu SUPER_ADMIN aktif.
  if (status === "INACTIVE" && existing.role?.key === "SUPER_ADMIN") {
    const remaining = await countActiveSuperAdmins(id);
    if (remaining === 0) {
      return fail(
        "Tidak dapat menonaktifkan SUPER_ADMIN terakhir. Minimal satu SUPER_ADMIN aktif harus tetap ada.",
      );
    }
  }

  await db
    .update(users)
    .set({ status })
    .where(eq(users.id, id));

  await logAudit({
    user: actor,
    action: status === "ACTIVE" ? "ACTIVATE" : "DEACTIVATE",
    entity: "USER",
    entityId: id,
    oldData: { status: existing.status },
    newData: { status },
  });
  revalidatePath("/users");
  return ok(
    status === "ACTIVE" ? "Pengguna diaktifkan." : "Pengguna dinonaktifkan.",
  );
}
