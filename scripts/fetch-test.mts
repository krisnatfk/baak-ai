import "dotenv/config";
import { db } from "../src/db/client";
import { knowledgeItems } from "../src/db/schema";
import { ilike } from "drizzle-orm";

async function main() {
  await db.update(knowledgeItems).set({ status: 'ACTIVE' }).where(ilike(knowledgeItems.answer, '%DRAFT:%'));

  const res = await fetch('http://localhost:3001/api/bot/menu', {
    headers: { Authorization: `Bearer ${process.env.INTERNAL_API_KEY}` }
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));

  await db.update(knowledgeItems).set({ status: 'DRAFT' }).where(ilike(knowledgeItems.answer, '%DRAFT:%'));
  process.exit(0);
}

main().catch(console.error);
