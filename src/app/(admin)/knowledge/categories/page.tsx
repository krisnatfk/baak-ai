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
import { CategoryDialog } from "@/components/knowledge/category-dialog";
import { CategoryRowActions } from "@/components/knowledge/category-row-actions";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const user = await requireUser();
  const canWrite = user.roleKey !== "VIEWER";

  const [categories, counts] = await Promise.all([
    db.query.knowledgeCategories.findMany({
      columns: {
        id: true,
        name: true,
        slug: true,
        description: true,
        color: true,
        isActive: true,
        showInBotMenu: true,
        updatedAt: true,
      },
      orderBy: (t, { asc }) => asc(t.name),
    }),
    db
      .select({
        categoryId: knowledgeItems.categoryId,
        count: sql<number>`count(*)::int`,
      })
      .from(knowledgeItems)
      .where(
        and(
          isNull(knowledgeItems.deletedAt),
          isNotNull(knowledgeItems.categoryId),
        ),
      )
      .groupBy(knowledgeItems.categoryId),
  ]);

  const countByCategory = new Map(
    counts.map((row) => [row.categoryId, row.count]),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Kategori</h1>
          <p className="text-sm text-muted-foreground">
            {categories.length} kategori — kelompokkan FAQ agar mudah dikelola
            dan difilter.
          </p>
        </div>
        {canWrite && (
          <CategoryDialog
            mode="create"
            trigger={
              <Button type="button">
                <Plus className="size-4" /> Tambah Kategori
              </Button>
            }
          />
        )}
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead className="hidden md:table-cell">Slug</TableHead>
              <TableHead className="text-center">FAQ</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Menu bot</TableHead>
              <TableHead className="hidden lg:table-cell">Diperbarui</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                  Belum ada kategori. Tambahkan kategori pertama Anda.
                </TableCell>
              </TableRow>
            ) : (
              categories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell className="max-w-sm">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block size-2.5 shrink-0 rounded-full"
                        style={
                          category.color
                            ? { backgroundColor: category.color }
                            : undefined
                        }
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{category.name}</div>
                        {category.description && (
                          <div className="truncate text-xs text-muted-foreground">
                            {category.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                    {category.slug}
                  </TableCell>
                  <TableCell className="text-center">
                    {countByCategory.get(category.id) ?? 0}
                  </TableCell>
                  <TableCell>
                    <Badge variant={category.isActive ? "default" : "secondary"}>
                      {category.isActive ? "Aktif" : "Nonaktif"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {category.showInBotMenu && category.isActive ? (
                      <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
                        Menu bot
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                    {category.updatedAt.toLocaleString("id-ID", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </TableCell>
                  <TableCell className="text-right">
                    {canWrite ? (
                      <CategoryRowActions
                        category={{
                          id: category.id,
                          name: category.name,
                          description: category.description,
                          color: category.color,
                          isActive: category.isActive,
                          showInBotMenu: category.showInBotMenu,
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
