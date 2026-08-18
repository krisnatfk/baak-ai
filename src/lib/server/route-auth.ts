/**
 * Helper otorisasi untuk Route Handler admin (bukan Server Action).
 *
 * Route handler di bawah /api/faq/* sudah dilewati proxy (perlu sesi); helper
 * ini memastikan sesi valid + bukan VIEWER, mengembalikan user atau Response
 * 401/403 yang siap dikembalikan handler.
 */

import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/guards";
import type { AuthSessionUser } from "@/lib/auth";

export type { AuthSessionUser };

/** Ambil user admin (ADMIN/SUPER_ADMIN) untuk route handler. */
export async function getAdminApiUser(): Promise<
  | { user: AuthSessionUser; error: null }
  | { user: null; error: NextResponse }
> {
  const user = await getAuthUser();
  if (!user) {
    return {
      user: null,
      error: NextResponse.json(
        { success: false, error: "UNAUTHORIZED", message: "Login diperlukan." },
        { status: 401 },
      ),
    };
  }
  if (user.roleKey === "VIEWER") {
    return {
      user: null,
      error: NextResponse.json(
        { success: false, error: "FORBIDDEN", message: "Tidak memiliki izin." },
        { status: 403 },
      ),
    };
  }
  return { user, error: null };
}
