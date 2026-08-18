import { and, isNotNull, isNull, sql } from "drizzle-orm";
import { Plus } from "lucide-react";
import { db } from "@/db/client";
import { knowledgeItems } from "@/db/schema";
import { requireUser } from "@/lib/guards";
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
import { SOURCE_TYPE_LABEL } from "@/components/knowledge/badges";
import { SourceDialog } from "@/components/knowledge/source-dialog";
import { SourceRowActions } from "@/components/knowledge/source-row-actions";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const user = await requireUser();
  const canWrite = user.roleKey !== "VIEWER";

  const [sources, counts] = await Promise.all([
    db.query.knowledgeSources.findMany({
      columns: {
        id: true,
        title: true,
        type: true,
        url: true,
        description: true,
        isActive: true,
        updatedAt: true,
      },
      orderBy: (t, { asc }) => asc(t.title),
    }),
    db
      .select({
        sourceId: knowledgeItems.sourceId,
        count: sql<number>`count(*)::int`,
      })
      .from(knowledgeItems)
      .where(
        and(isNull(knowledgeItems.deletedAt), isNotNull(knowledgeItems.sourceId)),
      )
      .groupBy(knowledgeItems.sourceId),
  ]);

  const countBySource = new Map(counts.map((row) => [row.sourceId, row.count]));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Sumber</h1>
          <p className="text-sm text-muted-foreground">
            {sources.length} sumber — asal informasi untuk FAQ dan dokumen.
          </p>
        </div>
        {canWrite && (
          <SourceDialog
            mode="create"
            trigger={
              <Button type="button">
                <Plus className="size-4" /> Tambah Sumber
              </Button>
            }
          />
        )}
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Judul</TableHead>
              <TableHead>Jenis</TableHead>
              <TableHead className="hidden lg:table-cell">URL</TableHead>
              <TableHead className="text-center">FAQ</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell">Diperbarui</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sources.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                  Belum ada sumber. Tambahkan sumber pertama Anda.
                </TableCell>
              </TableRow>
            ) : (
              sources.map((source) => (
                <TableRow key={source.id}>
                  <TableCell className="max-w-sm">
                    <div className="truncate font-medium">{source.title}</div>
                    {source.description && (
                      <div className="truncate text-xs text-muted-foreground">
                        {source.description}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal">
                      {SOURCE_TYPE_LABEL[source.type] ?? source.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden max-w-xs lg:table-cell">
                    {source.url ? (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="truncate text-sm text-primary underline-offset-4 hover:underline"
                      >
                        {source.url}
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {countBySource.get(source.id) ?? 0}
                  </TableCell>
                  <TableCell>
                    <Badge variant={source.isActive ? "default" : "secondary"}>
                      {source.isActive ? "Aktif" : "Nonaktif"}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                    {source.updatedAt.toLocaleString("id-ID", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </TableCell>
                  <TableCell className="text-right">
                    {canWrite ? (
                      <SourceRowActions
                        source={{
                          id: source.id,
                          title: source.title,
                          type: source.type,
                          url: source.url,
                          description: source.description,
                          isActive: source.isActive,
                        }}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">Hanya baca</span>
                    )}
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
