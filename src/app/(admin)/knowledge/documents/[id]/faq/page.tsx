import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import { db } from "@/db/client";
import { knowledgeDocuments, knowledgeItems } from "@/db/schema";
import { requireUser } from "@/lib/guards";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KnowledgeStatusBadge } from "@/components/knowledge/badges";
import { GeneratedFaqActions } from "@/components/knowledge/generated-faq-actions";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DocumentFaqReviewPage({ params }: PageProps) {
  const user = await requireUser();
  if (user.roleKey === "VIEWER") {
    return (
      <p className="text-sm text-muted-foreground">
        Anda tidak memiliki izin untuk me-review FAQ.
      </p>
    );
  }

  const { id } = await params;
  const doc = await db.query.knowledgeDocuments.findFirst({
    where: eq(knowledgeDocuments.id, id),
    columns: { id: true, title: true, fileName: true },
  });
  if (!doc) notFound();

  const items = await db.query.knowledgeItems.findMany({
    where: and(
      eq(knowledgeItems.sourceDocumentId, id),
      isNull(knowledgeItems.deletedAt),
    ),
    orderBy: asc(knowledgeItems.sourcePage),
    columns: {
      id: true,
      question: true,
      status: true,
      sourcePage: true,
      embeddingStatus: true,
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            FAQ dari &ldquo;{doc.title}&rdquo;
          </h1>
          <p className="text-sm text-muted-foreground">
            {items.length} kandidat FAQ berstatus Perlu Review. Publish yang
            valid, atau hapus yang tidak sesuai. Jawaban diambil langsung dari
            isi dokumen.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/knowledge/documents">
            <ArrowLeft className="size-4" /> Kembali ke Dokumen
          </Link>
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pertanyaan</TableHead>
              <TableHead className="w-24">Bagian</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  Belum ada FAQ yang di-generate dari dokumen ini. Gunakan tombol{" "}
                  <Sparkles className="inline size-3" /> Generate di halaman
                  Dokumen.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="max-w-lg">
                    <div className="line-clamp-2 font-medium">
                      {item.question}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Dari: {doc.title}
                      {item.sourcePage ? ` · bagian ${item.sourcePage}` : ""}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {item.sourcePage ?? "—"}
                  </TableCell>
                  <TableCell>
                    <KnowledgeStatusBadge status={item.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <GeneratedFaqActions id={item.id} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
