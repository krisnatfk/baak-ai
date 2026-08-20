import "dotenv/config";
import { db } from "../src/db/client";
import { knowledgeCategories, knowledgeItems } from "../src/db/schema";
import { eq } from "drizzle-orm";

async function run() {
  const pmb = await db.query.knowledgeCategories.findFirst({
    where: eq(knowledgeCategories.slug, 'pmb')
  });

  if (pmb) {
    const res = await db
      .delete(knowledgeItems)
      .where(eq(knowledgeItems.categoryId, pmb.id))
      .returning({ id: knowledgeItems.id });
    console.log(`Deleted ${res.length} PMB FAQs.`);
  } else {
    // Fail closed: kategori yang tidak ditemukan tidak boleh menghapus semua FAQ.
    console.log("PMB category not found. No FAQ deleted.");
  }
  process.exit(0);
}

run();
