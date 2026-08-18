/**
 * Server Actions — handoff manusia (escalation dari bot WhatsApp).
 *
 * Alur: bot gagal menjawab dengan keyakinan cukup / user minta admin →
 * n8n/WAHA membuat baris human_handoffs berstatus OPEN (via API internal).
 * Admin di halaman /handoff dapat:
 *  - assign ke admin lain (ASSIGNED)
 *  - ubah status (IN_PROGRESS / RESOLVED / CLOSED / reopen)
 *
 * Setiap mutasi dicatat ke audit log (entity HANDOFF).
 */

"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { humanHandoffs } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { requireRole } from "@/lib/guards";
import { fail, ok, type ActionResult } from "./shared";

export const HANDOFF_MANUAL_STATUSES = [
  "OPEN",
  "ASSIGNED",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
] as const;
export type HandoffManualStatus = (typeof HANDOFF_MANUAL_STATUSES)[number];

/** Transisi status yang diizinkan dari UI (reopen juga lewat sini). */
const TRANSITIONS: Record<HandoffManualStatus, HandoffManualStatus[]> = {
  OPEN: ["ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED"],
  ASSIGNED: ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"],
  IN_PROGRESS: ["OPEN", "ASSIGNED", "RESOLVED", "CLOSED"],
  RESOLVED: ["OPEN", "CLOSED"],
  CLOSED: ["OPEN"],
};

function isTerminal(next: HandoffManualStatus): boolean {
  return next === "RESOLVED" || next === "CLOSED";
}

/**
 * Assign handoff ke admin (atau reassign). Status di-set ke ASSIGNED.
 */
export async function assignHandoff(
  id: string,
  adminId: string,
): Promise<ActionResult> {
  const user = await requireRole("ADMIN", "SUPER_ADMIN");

  const existing = await db.query.humanHandoffs.findFirst({
    where: eq(humanHandoffs.id, id),
  });
  if (!existing) return fail("Handoff tidak ditemukan.");
  if (isTerminal(existing.status)) {
    return fail("Handoff sudah selesai — buka kembali dulu untuk mengubah penugasan.");
  }

  const admin = await db.query.users.findFirst({
    where: (t, { eq: e }) => e(t.id, adminId),
    columns: { id: true, name: true, email: true },
  });
  if (!admin) return fail("Admin tujuan tidak ditemukan.");

  await db
    .update(humanHandoffs)
    .set({
      status: "ASSIGNED",
      assignedAdminId: admin.id,
      note: null,
    })
    .where(eq(humanHandoffs.id, id));

  await logAudit({
    user,
    action: "ASSIGN",
    entity: "HANDOFF",
    entityId: id,
    oldData: { status: existing.status, assignedAdminId: existing.assignedAdminId },
    newData: { status: "ASSIGNED", assignedAdminId: admin.id },
  });
  revalidatePath("/handoff");
  revalidatePath(`/handoff/${id}`);
  return ok(`Handoff ditugaskan ke ${admin.name}.`);
}

/**
 * Ubah status handoff sesuai transisi yang diizinkan. Saat masuk status
 * terminal (RESOLVED/CLOSED), resolvedAt/resolvedBy diisi; saat reopen,
 * keduanya dibersihkan.
 */
export async function setHandoffStatus(
  id: string,
  next: HandoffManualStatus,
): Promise<ActionResult> {
  const user = await requireRole("ADMIN", "SUPER_ADMIN");
  if (!HANDOFF_MANUAL_STATUSES.includes(next)) {
    return fail("Status tidak valid.");
  }

  const existing = await db.query.humanHandoffs.findFirst({
    where: eq(humanHandoffs.id, id),
  });
  if (!existing) return fail("Handoff tidak ditemukan.");

  const allowed = TRANSITIONS[existing.status];
  if (!allowed || !allowed.includes(next)) {
    return fail(`Transisi status dari ${existing.status} ke ${next} tidak diizinkan.`);
  }

  const enteringTerminal = isTerminal(next);
  const leavingTerminal = isTerminal(existing.status);

  await db
    .update(humanHandoffs)
    .set({
      status: next,
      ...(enteringTerminal
        ? { resolvedAt: new Date(), resolvedBy: user.id }
        : {}),
      ...(leavingTerminal && !enteringTerminal
        ? { resolvedAt: null, resolvedBy: null }
        : {}),
    })
    .where(eq(humanHandoffs.id, id));

  await logAudit({
    user,
    action: "STATUS_CHANGE",
    entity: "HANDOFF",
    entityId: id,
    oldData: { status: existing.status },
    newData: { status: next },
  });
  revalidatePath("/handoff");
  revalidatePath(`/handoff/${id}`);
  return ok("Status handoff diperbarui.");
}

/**
 * Simpan catatan (note) pada handoff — tanpa mengubah status.
 */
export async function saveHandoffNote(id: string, note: string): Promise<ActionResult> {
  const user = await requireRole("ADMIN", "SUPER_ADMIN");

  const trimmed = note.trim().slice(0, 2000);
  const existing = await db.query.humanHandoffs.findFirst({
    where: eq(humanHandoffs.id, id),
  });
  if (!existing) return fail("Handoff tidak ditemukan.");

  await db
    .update(humanHandoffs)
    .set({ note: trimmed || null })
    .where(eq(humanHandoffs.id, id));

  await logAudit({
    user,
    action: "UPDATE",
    entity: "HANDOFF",
    entityId: id,
    oldData: { note: existing.note },
    newData: { note: trimmed || null },
  });
  revalidatePath(`/handoff/${id}`);
  return ok("Catatan handoff disimpan.");
}
