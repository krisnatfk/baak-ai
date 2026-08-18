/**
 * Route handler NextAuth (App Router).
 * URL: /api/auth/signin, /api/auth/session, /api/auth/callback/credentials, dll.
 */

import NextAuth from "next-auth";
import { getAuthOptions } from "@/lib/auth";
import { getAppUrl, getAuthSecret } from "@/lib/env";

/**
 * Handler dibangun SECARA LAZY.
 *
 * Saat `next build`, Next.js mengeksekusi kode modul route ini untuk
 * mengumpulkan metadata route. Membangun handler di modul-level (memanggil
 * `NextAuth(authOptions)` dan membaca `env.authSecret`/`env.appUrl`) akan
 * gagal karena secret runtime (AUTH_SECRET) baru ada saat container berjalan
 * (env_file), bukan saat image di-build. Deferred sampai request pertama.
 */
let cachedHandler: ReturnType<typeof NextAuth> | null = null;

function getHandler(): ReturnType<typeof NextAuth> {
  if (!cachedHandler) {
    // Pastikan NextAuth v4 membaca URL & secret yang benar walau hanya ada
    // AUTH_SECRET / APP_URL (bukan NEXTAUTH_*).
    if (!process.env.NEXTAUTH_SECRET) process.env.NEXTAUTH_SECRET = getAuthSecret();
    if (!process.env.NEXTAUTH_URL) process.env.NEXTAUTH_URL = getAppUrl();

    cachedHandler = NextAuth(getAuthOptions());
  }
  return cachedHandler;
}

export function GET(req: Request, ctx: { params: Promise<{ nextauth: string[] }> }) {
  // `NextAuth(authOptions)` mengembalikan SATU fungsi handler (bukan objek
  // dengan .GET/.POST). Fungsi itu mendispatch Pages vs App Router lewat
  // keberadaan `ctx.params` — jadi handler dipanggil langsung.
  return getHandler()(req, ctx);
}

export function POST(req: Request, ctx: { params: Promise<{ nextauth: string[] }> }) {
  return getHandler()(req, ctx);
}
