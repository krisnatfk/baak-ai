/**
 * Guard otorisasi (server-side).
 *
 *  - requireUser / requireRole : untuk Server Component / Server Action —
 *    redirect ke /login atau /dashboard bila tidak berhak.
 *  - getAuthUser / getAuthUserOrNull : untuk Route Handler — kembalikan null
 *    agar handler bisa membalas 401/403 (bukan redirect).
 */

import "server-only";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { getAuthOptions, type AuthSessionUser } from "@/lib/auth";
import { ROLE_KEYS, type RoleKey } from "@/db/schema";

export const ROLE_ORDER: RoleKey[] = [...ROLE_KEYS];

/** User sesi aktif (null bila belum login / sesi invalid). */
export async function getAuthUser(): Promise<AuthSessionUser | null> {
  const session = await getServerSession(getAuthOptions());
  const user = session?.user;
  if (!user?.id || !user.roleKey) return null;
  return {
    id: user.id,
    name: user.name ?? "",
    email: user.email ?? "",
    roleId: user.roleId,
    roleKey: user.roleKey as RoleKey,
  };
}

/** Wajib login — redirect ke /login bila tidak. */
export async function requireUser(): Promise<AuthSessionUser> {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  return user;
}

/** Wajib salah satu role — redirect ke /dashboard bila tidak berhak. */
export async function requireRole(...allowed: RoleKey[]): Promise<AuthSessionUser> {
  const user = await requireUser();
  if (!allowed.includes(user.roleKey)) redirect("/dashboard");
  return user;
}

/**
 * Cek permission granular (dari roles.permissions).
 * Dipakai Server Action: panggil lalu lempar error bila null.
 */
export async function hasPermission(user: AuthSessionUser, perm: string): Promise<boolean> {
  // SUPER_ADMIN punya semua permission.
  if (user.roleKey === "SUPER_ADMIN") return true;
  const role = await import("@/db/client").then((m) =>
    m.db.query.roles.findFirst({
      where: (r, { eq }) => eq(r.id, user.roleId),
      columns: { permissions: true },
    }),
  );
  return role?.permissions?.includes(perm) ?? false;
}
