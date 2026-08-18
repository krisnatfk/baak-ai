/**
 * Skema zod untuk manajemen pengguna (SUPER_ADMIN).
 *
 * Modul ini TIDAK boleh mengimpor apa pun dari server (`@/db/client`,
 * `@/lib/env`, `server-only`). Dipakai bersama oleh:
 *  - Server Action (validasi ulang sisi server) di users.ts, dan
 *  - komponen form client (validasi real-time via zodResolver).
 */

import { z } from "zod";

export const USER_STATUS_VALUES = ["ACTIVE", "INACTIVE"] as const;
export type UserStatusValue = (typeof USER_STATUS_VALUES)[number];

const nameField = z
  .string()
  .trim()
  .min(2, "Nama minimal 2 karakter.")
  .max(150, "Nama maksimal 150 karakter.");

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Email wajib diisi.")
  .email("Format email tidak valid.")
  .max(255, "Email maksimal 255 karakter.");

const roleIdField = z.string().min(1, "Pilih peran.");

export const createUserSchema = z.object({
  name: nameField,
  email: emailField,
  roleId: roleIdField,
  password: z
    .string()
    .min(8, "Password minimal 8 karakter.")
    .max(72, "Password maksimal 72 karakter."),
});
export type CreateUserFormValues = z.infer<typeof createUserSchema>;
/** Tipe INPUT skema — lihat CategoryFormInput di knowledge-schema.ts. */
export type CreateUserFormInput = z.input<typeof createUserSchema>;

export const updateUserSchema = z.object({
  name: nameField,
  email: emailField,
  roleId: roleIdField,
  status: z.enum(USER_STATUS_VALUES),
  // Kosongkan untuk tidak mengubah password.
  password: z
    .string()
    .max(72, "Password maksimal 72 karakter.")
    .refine((v) => v === "" || v.length >= 8, "Password minimal 8 karakter.")
    .optional()
    .default(""),
});
export type UpdateUserFormValues = z.infer<typeof updateUserSchema>;
/** Tipe INPUT skema (password opsional karena ada .default()). */
export type UpdateUserFormInput = z.input<typeof updateUserSchema>;
