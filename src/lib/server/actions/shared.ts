/**
 * Helper bersama untuk server actions (hasil, error, deteksi unique violation).
 *
 * Dipakai oleh knowledge.ts, unanswered.ts, handoff.ts, users.ts agar
 * `ActionResult` konsisten di seluruh modul dan bisa dipakai komponen client.
 */

import { z } from "zod";

export type ActionResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string[]> };

export function ok(message: string, id?: string): ActionResult {
  return { ok: true, message, id };
}

export function fail(
  message: string,
  fieldErrors?: Record<string, string[]>,
): ActionResult {
  return { ok: false, message, fieldErrors };
}

/** Ubah error zod menjadi ActionResult + fieldErrors (path pertama per isu). */
export function zodFail(error: z.ZodError): ActionResult {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path[0]?.toString() ?? "_form";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fail("Periksa kembali isian formulir.", fieldErrors);
}

/** Deteksi constraint violation PostgreSQL (unique) → kode 23505. */
export function isUniqueViolation(error: unknown): boolean {
  if (error && typeof error === "object" && "code" in error) {
    return (error as { code?: string }).code === "23505";
  }
  return false;
}
