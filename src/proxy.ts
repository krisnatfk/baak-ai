/**
 * Proxy (pengganti middleware pada Next.js 16) — proteksi akses dashboard.
 *
 * Aturan:
 *  - /login        → publik (redirect ke /dashboard bila sudah login).
 *  - /api/auth/*   → publik (handled by NextAuth).
 *  - /api/health   → publik (healthcheck Docker).
 *  - /api/rag/*    → publik di proxy (dilindungi INTERNAL_API_KEY di route).
 *  - /api/bot/*    → publik di proxy (dilindungi INTERNAL_API_KEY di route).
 *  - /api/files/*  → publik di proxy (media/lampiran chatbot; nama file acak
 *                    + containment path di route handler mencegah enumerasi).
 *  - seluruh halaman dashboard/admin → wajib sesi valid.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { getAuthSecret } from "@/lib/env";

const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth",
  "/api/health",
  "/api/rag",
  "/api/bot",
  "/api/files",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  const token = await getToken({ req, secret: getAuthSecret() });

  // Belum login → arahkan ke halaman login, bawa callbackUrl.
  if (!token) {
    const url = new URL("/login", req.url);
    url.searchParams.set("callbackUrl", pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Jalankan proxy pada semua path kecuali aset statis & berkas media.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
