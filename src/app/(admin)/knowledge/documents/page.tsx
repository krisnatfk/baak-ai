import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { Plus } from "lucide-react";
import { db } from "@/db/client";
import { knowledgeDocumentChunks } from "@/db/schema";
import { requireUser } from "@/lib/guards";
import { formatBytes } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DocumentStatusBadge,
  SOURCE_TYPE_LABEL,
} from "@/components/knowledge/badges";
import { DocumentUpload } from "@/components/knowledge/document-upload";
import { DocumentRowActions } from "@/components/knowledge/document-row-actions";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const user = await requireUser();
  const canWrite = user.roleKey !== "VIEWER";

  const [documents, sources, failedByDocument] = await Promise.all([
    db.query.knowledgeDocuments.findMany({
      columns: {
        id: true,
        title: true,
        fileName: true,
        fileType: true,
        fileSize: true,
        status: true,
        error: true,
        chunkCount: true,
        createdAt: true,
      },
      orderBy: (t, { desc }) => desc(t.createdAt),
      with: {
        source: {
          columns: { id: true, title: true },
        },
      },
    }),
    db.query.knowledgeSources.findMany({
      columns: { id: true, title: true },
      orderBy: (t, { asc }) => asc(t.title),
      where: (t, { eq }) => eq(t.isActive, true),
    }),
    db
      .select({
        documentId: knowledgeDocumentChunks.documentId,
        count: sql<number>`count(*)::int`,
      })
      .from(knowledgeDocumentChunks)
      .where(eq(knowledgeDocumentChunks.embeddingStatus, "FAILED"))
      .groupBy(knowledgeDocumentChunks.documentId),
  ]);

  const failedByDocumentMap = new Map(
    failedByDocument.map((row) => [row.documentId, row.count]),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dokumen</h1>
          <p className="text-sm text-muted-foreground">
            {documents.length} dokumen — teksnya di-embed dan bisa dicari
            chatbot (PDF, DOCX, TXT).
          </p>
        </div>
        {canWrite && (
          <DocumentUpload
            sources={sources}
            trigger={
              <Button type="button">
                <Plus className="size-4" /> Unggah Dokumen
              </Button>
            }
          />
        )}
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Dokumen</TableHead>
              <TableHead>Jenis</TableHead>
              <TableHead>Ukuran</TableHead>
              <TableHead className="hidden lg:table-cell">Sumber</TableHead>
              <TableHead className="text-center">Bagian</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell">Diunggah</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  Belum ada dokumen. Unggah PDF, DOCX, atau TXT untuk menambah
                  pengetahuan chatbot.
                </TableCell>
              </TableRow>
            ) : (
              documents.map((doc) => {
                const failedChunks = failedByDocumentMap.get(doc.id) ?? 0;
                return (
                  <TableRow key={doc.id}>
                    <TableCell className="max-w-sm">
                      <Link
                        href={`/knowledge/documents/${doc.id}/faq`}
                        className="truncate font-medium hover:underline"
                      >
                        {doc.title}
                      </Link>
                      <div className="truncate text-xs text-muted-foreground">
                        {doc.fileName}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-normal">
                        {SOURCE_TYPE_LABEL[doc.fileType] ?? doc.fileType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatBytes(doc.fileSize)}
                    </TableCell>
                    <TableCell className="hidden max-w-xs lg:table-cell">
                      {doc.source ? (
                        <span className="truncate text-sm">
                          {doc.source.title}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          — tanpa sumber
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-center text-sm">
                      {doc.chunkCount}
                      {failedChunks > 0 && (
                        <span className="ml-1 text-xs text-destructive">
                          ({failedChunks} gagal)
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DocumentStatusBadge status={doc.status} error={doc.error} />
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                      {doc.createdAt.toLocaleString("id-ID", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      {canWrite ? (
                        <DocumentRowActions
                          document={{
                            id: doc.id,
                            status: doc.status,
                            fileName: doc.fileName,
                          }}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Hanya baca
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
