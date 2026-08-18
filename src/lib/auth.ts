/**
 * Konfigurasi NextAuth (credentials + JWT) untuk BAAK AI.
 *
 * - Hanya provider credentials (email + password, bcrypt).
 * - JWT berisi uid/roleId/roleKey; session divalidasi ulang ke database
 *   setiap fetch agar user yang dinonaktifkan langsung kehilangan akses
 *   (tanpa menunggu JWT kadaluarsa).
 * - Modul ini server-only (import db/bcrypt/env) — jangan di-import client.
 */

import "server-only";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthOptions } from "next-auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getAuthMaxAgeSeconds, getAuthSecret } from "@/lib/env";
import type { RoleKey } from "@/db/schema";

/**
 * Factory lazy konfigurasi NextAuth.
 *
 * MENGAPA LAZY (bukan `export const authOptions`)?
 * Objek ini mengevaluasi `secret` dan `session.maxAge` saat dibuat. Saat
 * `next build`, Next.js meng-import modul route untuk mengumpulkan page data
 * dan AUTH_SECRET belum tersedia (baru disuplai container via env_file).
 * Dengan factory, validasi secret tertunda sampai auth benar-benar dipakai
 * (login / getServerSession) — build tidak lagi gagal karena missing secret.
 */
let cachedAuthOptions: NextAuthOptions | null = null;

export function getAuthOptions(): NextAuthOptions {
  if (cachedAuthOptions) return cachedAuthOptions;

  cachedAuthOptions = {
    providers: [
      CredentialsProvider({
        name: "Kredensial",
        credentials: {
          email: { label: "Email", type: "email" },
          password: { label: "Password", type: "password" },
        },
        async authorize(credentials) {
          if (!credentials?.email || !credentials?.password) return null;

          const user = await db.query.users.findFirst({
            where: eq(users.email, credentials.email.toLowerCase().trim()),
            columns: {
              id: true,
              name: true,
              email: true,
              passwordHash: true,
              roleId: true,
              status: true,
            },
            with: { role: { columns: { key: true } } },
          });

          if (!user || user.status !== "ACTIVE") return null;

          const ok = await bcrypt.compare(credentials.password, user.passwordHash);
          if (!ok) return null;

          return {
            id: user.id,
            name: user.name,
            email: user.email,
            roleId: user.roleId,
            roleKey: user.role.key as RoleKey,
          };
        },
      }),
    ],
    session: {
      strategy: "jwt",
      maxAge: getAuthMaxAgeSeconds(),
    },
    secret: getAuthSecret(),
    pages: {
      signIn: "/login",
    },
    callbacks: {
      async jwt({ token, user }) {
        if (user) {
          token.uid = user.id;
          token.roleId = user.roleId;
          token.roleKey = user.roleKey;
        }
        return token;
      },
      async session({ session, token }) {
        // Validasi ulang ke DB — jangan percaya JWT lama (user dinonaktifkan /
        // role diganti harus berefek segera).
        if (!token.uid) return session;

        const user = await db.query.users.findFirst({
          where: eq(users.id, token.uid),
          columns: { id: true, name: true, email: true, roleId: true, status: true },
          with: { role: { columns: { key: true } } },
        });

        if (!user || user.status !== "ACTIVE") {
          // Sesi invalid — hapus data user agar guard mengarah ke /login.
          session.user = { name: "", email: "", image: null, id: "", roleId: "", roleKey: "" };
          return session;
        }

        session.user = {
          id: user.id,
          name: user.name,
          email: user.email,
          image: null,
          roleId: user.roleId,
          roleKey: user.role.key as RoleKey,
        };
        return session;
      },
    },
  };

  return cachedAuthOptions;
}

/** Tipe user yang tersedia di session server-side. */
export interface AuthSessionUser {
  id: string;
  name: string;
  email: string;
  roleId: string;
  roleKey: RoleKey;
}
