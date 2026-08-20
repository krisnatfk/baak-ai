import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../src/db/client";
import {
  knowledgeAttachments,
  knowledgeCategories,
  knowledgeItems,
  knowledgeMedia,
} from "../src/db/schema";
import { localUploadFileExists } from "../src/lib/server/upload-storage";

type AuditRow = {
  type: "MEDIA" | "ATTACHMENT";
  recordId: string;
  faqId: string;
  question: string;
  category: string | null;
  filePath: string;
  externalUrl: string | null;
  recordStatus: string;
  status: "EXISTS" | "MISSING";
};

const cleanup = process.argv.includes("--cleanup");
const backupConfirmed = process.argv.includes("--backup-confirmed");
const uploadDirArg = process.argv.find((arg) => arg.startsWith("--upload-dir="));
if (uploadDirArg) {
  process.env.UPLOAD_DIR = path.resolve(uploadDirArg.slice("--upload-dir=".length));
} else if (
  process.platform === "win32" &&
  process.env.UPLOAD_DIR?.replace(/\\/g, "/") === "/app/uploads" &&
  fs.existsSync(path.resolve("uploads"))
) {
  // Docker Compose memetakan host ./uploads ke container /app/uploads.
  process.env.UPLOAD_DIR = path.resolve("uploads");
  console.log(`[asset-audit] host bind source: ${process.env.UPLOAD_DIR}`);
}

async function main(): Promise<void> {
  const [mediaRows, attachmentRows] = await Promise.all([
    db
      .select({
        recordId: knowledgeMedia.id,
        faqId: knowledgeMedia.knowledgeId,
        question: knowledgeItems.question,
        category: knowledgeCategories.name,
        filePath: knowledgeMedia.filePath,
        externalUrl: knowledgeMedia.url,
        recordStatus: knowledgeItems.status,
      })
      .from(knowledgeMedia)
      .innerJoin(knowledgeItems, eq(knowledgeItems.id, knowledgeMedia.knowledgeId))
      .leftJoin(knowledgeCategories, eq(knowledgeCategories.id, knowledgeItems.categoryId)),
    db
      .select({
        recordId: knowledgeAttachments.id,
        faqId: knowledgeAttachments.knowledgeId,
        question: knowledgeItems.question,
        category: knowledgeCategories.name,
        filePath: knowledgeAttachments.filePath,
        externalUrl: knowledgeAttachments.url,
        recordStatus: knowledgeItems.status,
      })
      .from(knowledgeAttachments)
      .innerJoin(knowledgeItems, eq(knowledgeItems.id, knowledgeAttachments.knowledgeId))
      .leftJoin(knowledgeCategories, eq(knowledgeCategories.id, knowledgeItems.categoryId)),
  ]);

  const audit = async (
    type: AuditRow["type"],
    rows: Array<
      Omit<AuditRow, "type" | "status" | "filePath"> & { filePath: string | null }
    >,
  ): Promise<AuditRow[]> => {
    const output: AuditRow[] = [];
    for (const row of rows) {
      if (!row.filePath) continue;
      output.push({
        ...row,
        filePath: row.filePath,
        type,
        status: await localUploadFileExists(row.filePath) ? "EXISTS" : "MISSING",
      });
    }
    return output;
  };

  const rows = [
    ...await audit("MEDIA", mediaRows),
    ...await audit("ATTACHMENT", attachmentRows),
  ];
  console.table(rows);

  const missingMedia = rows.filter((row) => row.type === "MEDIA" && row.status === "MISSING");
  const missingAttachments = rows.filter(
    (row) => row.type === "ATTACHMENT" && row.status === "MISSING",
  );
  console.log(`[asset-audit] stale media: ${missingMedia.length}`);
  console.log(`[asset-audit] stale attachments: ${missingAttachments.length}`);

  if (!cleanup) {
    console.log(
      "[asset-audit] read-only; cleanup memerlukan --cleanup --backup-confirmed setelah backup DB.",
    );
    return;
  }
  if (!backupConfirmed) {
    throw new Error("Cleanup ditolak: buat backup DB lalu sertakan --backup-confirmed.");
  }

  await db.transaction(async (tx) => {
    if (missingMedia.length > 0) {
      await tx
        .delete(knowledgeMedia)
        .where(inArray(knowledgeMedia.id, missingMedia.map((row) => row.recordId)));
    }
    if (missingAttachments.length > 0) {
      await tx
        .delete(knowledgeAttachments)
        .where(inArray(knowledgeAttachments.id, missingAttachments.map((row) => row.recordId)));
    }
  });
  console.log(`[asset-audit] deleted stale media: ${missingMedia.length}`);
  console.log(`[asset-audit] deleted stale attachments: ${missingAttachments.length}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
