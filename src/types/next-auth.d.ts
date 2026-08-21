/**
 * Perluasan tipe NextAuth (JWT + Session) untuk data role PMB AI.
 */

import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  /** User dari authorize() (Credentials). */
  interface User {
    roleId: string;
    roleKey: string;
  }

  interface Session {
    user: {
      id: string;
      roleId: string;
      roleKey: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    /** ID user dari tabel `users`. */
    uid?: string;
    roleId?: string;
    roleKey?: string;
  }
}
