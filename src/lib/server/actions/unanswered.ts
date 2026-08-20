/**
 * Server Actions — pertanyaan tidak terjawab (unanswered questions).
 *
 * Alur: RAG confidence LOW → saveUnanswered() mencatat pertanyaan berstatus
 * NEW. Admin meninjau di halaman /unanswered, lalu:
 *  - "Tambahkan ke Knowledge Base" → buat FAQ baru (lihat createFaq + halaman
 *    /knowledge/faq/new?unanswered=<id>) → status jadi ADDED_TO_KNOWLEDGE.
 *  - "Tandai Ditinjau" / "Tandai Dijawab" / "Abaikan" → setUnansweredStatus.
 */

"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { unansweredQuestions } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { requireRole } from "@/lib/guards";
import { fail, ok, type ActionResult } from "./shared";

/** Status yang bisa diubah manual dari halaman unanswered (selain ADDED_TO_KNOWLEDGE). */
const UNANSWERED_MANUAL_STATUSES = [
  "NEW",
  "REVIEWED",
  "ANSWERED",
  "IGNORED",
] as const;
export type UnansweredManualStatus = (typeof UNANSWERED_MANUAL_STATUSES)[number];

export async function setUnansweredStatus(
  id: string,
  status: UnansweredManualStatus,
): Promise<ActionResult> {
  const user = await requireRole("ADMIN", "SUPER_ADMIN");
  if (!UNANSWERED_MANUAL_STATUSES.includes(status)) {
    return fail("Status tidak valid.");
  }

  const existing = await db.query.unansweredQuestions.findFirst({
    where: eq(unansweredQuestions.id, id),
  });
  if (!existing) return fail("Pertanyaan tidak ditemukan.");

  await db
    .update(unansweredQuestions)
    .set({
      status,
      reviewedAt: new Date(),
      reviewedBy: user.id,
    })
    .where(eq(unansweredQuestions.id, id));

  await logAudit({
    user,
    action: "REVIEW",
    entity: "UNANSWERED",
    entityId: id,
    oldData: { status: existing.status },
    newData: { status },
  });
  revalidatePath("/unanswered");
  return ok("Status pertanyaan diperbarui.");
}
