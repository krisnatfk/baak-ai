/**
 * Helper error database (server-only).
 */

/** Kode error PostgreSQL untuk pelanggaran constraint unik. */
const UNIQUE_VIOLATION = "23505";

/** Cek apakah error berasal dari pelanggaran unique constraint. */
export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === UNIQUE_VIOLATION
  );
}
