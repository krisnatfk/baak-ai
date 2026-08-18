/**
 * Pencatatan audit log (server-only).
 *
 * Setiap mutasi data dari Server Action / Route Handler harus melewati
 * logAudit agar jejak "siapa melakukan apa" tercatat di tabel audit_logs.
 */

import "server-only";
import { headers } from "next/headers";
import { db } from "@/db/client";
import { auditLogs } from "@/db/schema";
import type { AuthSessionUser } from "@/lib/auth";

export type AuditEntity =
  | "CATEGORY"
  | "SOURCE"
  | "FAQ"
  | "USER"
  | "ROLE"
  | "UNANSWERED"
  | "HANDOFF"
  | "DOCUMENT"
  | "MEDIA"
  | "ATTACHMENT"
  | "IMPORT_BATCH";

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "ACTIVATE"
  | "DEACTIVATE"
  | "RESTORE"
  | "STATUS_CHANGE"
  | "ASSIGN"
  | "RESOLVE"
  | "REVIEW"
  | "RETRY_EMBEDDING"
  | "LOGIN"
  | "LOGOUT"
  | "UPLOAD"
  | "CHUNK"
  | "PROCESS"
  | "EXPORT"
  | "IMPORT"
  | "ROLLBACK"
  | "GENERATE"
  | "BULK_UPDATE";

interface LogAuditInput {
  user: AuthSessionUser;
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
}

/**
 * Simpan audit log. IP/User-Agent dibaca dari request header (best-effort —
 * saat tidak tersedia, bernilai null; mis. dipanggil dari cron internal).
 */
export async function logAudit({
  user,
  action,
  entity,
  entityId,
  oldData,
  newData,
}: LogAuditInput): Promise<void> {
  let ip: string | null = null;
  let userAgent: string | null = null;
  try {
    const h = await headers();
    ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    userAgent = h.get("user-agent");
  } catch {
    // headers() bisa gagal di luar konteks request (cron) — abaikan.
  }

  await db.insert(auditLogs).values({
    userId: user.id,
    userEmail: user.email,
    action,
    entity,
    entityId,
    oldData: oldData ?? null,
    newData: newData ?? null,
    ip,
    userAgent,
  });
}
