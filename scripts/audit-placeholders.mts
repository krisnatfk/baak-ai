import "dotenv/config";
import { and, eq, ilike, isNull } from "drizzle-orm";
import { db, pool } from "../src/db/client";
import { knowledgeItems } from "../src/db/schema";

const shouldSetDraft = process.argv.includes("--set-draft");

async function main() {
  const rows = await db
    .select({ id: knowledgeItems.id, question: knowledgeItems.question, status: knowledgeItems.status })
    .from(knowledgeItems)
    .where(and(isNull(knowledgeItems.deletedAt), ilike(knowledgeItems.answer, "DRAFT:%")));

  console.table(rows);
  console.log(`[placeholder-audit] ditemukan: ${rows.length}`);

  if (!shouldSetDraft || rows.length === 0) {
    console.log("[placeholder-audit] read-only; gunakan --set-draft untuk menonaktifkan secara aman.");
    return;
  }

  const changed = await db
    .update(knowledgeItems)
    .set({ status: "DRAFT", updatedAt: new Date() })
    .where(
      and(
        eq(knowledgeItems.status, "ACTIVE"),
        isNull(knowledgeItems.deletedAt),
        ilike(knowledgeItems.answer, "DRAFT:%"),
      ),
    )
    .returning({ id: knowledgeItems.id });
  console.log(`[placeholder-audit] ACTIVE -> DRAFT: ${changed.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
