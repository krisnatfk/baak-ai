import Link from "next/link";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { Download, FileUp, Plus, Search, Upload } from "lucide-react";
import { db } from "@/db/client";
import {
  knowledgeCategories,
  knowledgeItems,
  knowledgeSources,
} from "@/db/schema";
import { requireUser } from "@/lib/guards";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AUDIENCE_LABEL,
  EMBEDDING_STATUS_LABEL,
  KNOWLEDGE_STATUS_LABEL,
} from "@/components/knowledge/badges";
import {
  FaqBulkTable,
  type FaqCategoryOption,
  type FaqTableItem,
} from "@/components/knowledge/faq-bulk-table";
import { EmbeddingQueueButton } from "@/components/knowledge/embedding-queue-button";
import { MenuPreviewDialog } from "@/components/knowledge/menu-preview-dialog";

export const dynamic = "force-dynamic";

const PAGE_SIZES = [25, 50, 100] as const;
const STATUS_OPTIONS = ["DRAFT", "ACTIVE", "INACTIVE", "NEEDS_REVIEW"] as const;
const EMBEDDING_OPTIONS = ["PENDING", "COMPLETED", "FAILED"] as const;
const AUDIENCE_OPTIONS = [
  "MAHASISWA",
  "CALON_MAHASISWA",
  "ALUMNI",
  "ORANG_TUA",
  "UMUM",
] as const;

interface FaqPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function stringParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidParam(v: string | string[] | undefined): string {
  const s = stringParam(v);
  if (!s || s === "all") return "";
  return UUID_REGEX.test(s) ? s : "";
}

function pick<T extends readonly string[]>(
  v: string | string[] | undefined,
  options: T,
): T[number] | "" {
  const s = stringParam(v);
  return options.includes(s as T[number]) ? (s as T[number]) : "";
}

export default async function FaqPage({ searchParams }: FaqPageProps) {
  const user = await requireUser();
  const canWrite = user.roleKey !== "VIEWER";
  const params = await searchParams;

  const q = stringParam(params.q)?.trim() ?? "";
  const status = pick(params.status, STATUS_OPTIONS);
  const category = uuidParam(params.category);
  const audience = pick(params.audience, AUDIENCE_OPTIONS);
  const source = uuidParam(params.source);
  const embedding = pick(params.embedding, EMBEDDING_OPTIONS);
  const pageSize = PAGE_SIZES.includes(Number(params.pageSize) as never)
    ? (Number(params.pageSize) as (typeof PAGE_SIZES)[number])
    : 25;
  const page = Math.max(1, Number(params.page) || 1);

  const where = and(
    isNull(knowledgeItems.deletedAt),
    status ? eq(knowledgeItems.status, status) : undefined,
    category ? eq(knowledgeItems.categoryId, category) : undefined,
    audience ? eq(knowledgeItems.audience, audience) : undefined,
    source ? eq(knowledgeItems.sourceId, source) : undefined,
    embedding ? eq(knowledgeItems.embeddingStatus, embedding) : undefined,
    q
      ? or(
          ilike(knowledgeItems.question, `%${q}%`),
          ilike(knowledgeItems.answer, `%${q}%`),
        )
      : undefined,
  );

  const [
    total,
    items,
    categories,
    sources,
    statusCounts,
    embeddingFailed,
    embeddingPending,
  ] = await Promise.all([
    db.$count(knowledgeItems, where),
    db.query.knowledgeItems.findMany({
      where,
      orderBy: desc(knowledgeItems.updatedAt),
      limit: pageSize,
      offset: (page - 1) * pageSize,
      columns: {
        id: true,
        question: true,
        audience: true,
        status: true,
        embeddingStatus: true,
        embeddingError: true,
      },
      with: {
        category: { columns: { name: true, color: true } },
        source: { columns: { title: true } },
      },
    }),
    db
      .select({ id: knowledgeCategories.id, name: knowledgeCategories.name })
      .from(knowledgeCategories)
      .orderBy(asc(knowledgeCategories.name)),
    db
      .select({ id: knowledgeSources.id, title: knowledgeSources.title })
      .from(knowledgeSources)
      .orderBy(asc(knowledgeSources.title)),
    db
      .select({
        status: knowledgeItems.status,
        count: sql<number>`count(*)::int`,
      })
      .from(knowledgeItems)
      .where(isNull(knowledgeItems.deletedAt))
      .groupBy(knowledgeItems.status),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(knowledgeItems)
      .where(
        and(
          isNull(knowledgeItems.deletedAt),
          eq(knowledgeItems.embeddingStatus, "FAILED"),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(knowledgeItems)
      .where(
        and(
          isNull(knowledgeItems.deletedAt),
          eq(knowledgeItems.embeddingStatus, "PENDING"),
        ),
      ),
  ]);

  const statusMap = Object.fromEntries(
    statusCounts.map((s) => [s.status, s.count]),
  );
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const tableItems: FaqTableItem[] = items.map((item) => ({
    id: item.id,
    question: item.question,
    categoryName: item.category?.name ?? null,
    categoryColor: item.category?.color ?? null,
    sourceTitle: item.source?.title ?? null,
    audience: item.audience,
    status: item.status,
    embeddingStatus: item.embeddingStatus,
    embeddingError: item.embeddingError,
  }));
  const categoryOptions: FaqCategoryOption[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
  }));

  const hrefFor = (p: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (status) sp.set("status", status);
    if (category) sp.set("category", category);
    if (audience) sp.set("audience", audience);
    if (source) sp.set("source", source);
    if (embedding) sp.set("embedding", embedding);
    sp.set("pageSize", String(pageSize));
    sp.set("page", String(p));
    return `/knowledge/faq?${sp.toString()}`;
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">FAQ</h1>
          <p className="text-sm text-muted-foreground">
            Kelola pengetahuan yang digunakan chatbot. {total} entri.
          </p>
        </div>
        {canWrite && (
          <div className="flex flex-wrap items-center gap-2">
            <EmbeddingQueueButton />
            <Button variant="outline" asChild>
              <Link href="/knowledge/faq/import-history">
                <FileUp className="size-4" /> Import History
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <a href="/api/faq/import/template">
                <Download className="size-4" /> Template
              </a>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/knowledge/faq/import">
                <Upload className="size-4" /> Import FAQ
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Download className="size-4" /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <a href="/api/faq/export?format=xlsx">Export XLSX</a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href="/api/faq/export?format=csv">Export CSV</a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <MenuPreviewDialog />
            <Button asChild>
              <Link href="/knowledge/faq/new">
                <Plus className="size-4" /> Tambah FAQ
              </Link>
            </Button>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <SummaryCard label="Total FAQ" value={String(total)} />
        <SummaryCard label="Published" value={String(statusMap["ACTIVE"] ?? 0)} />
        <SummaryCard label="Draft" value={String(statusMap["DRAFT"] ?? 0)} />
        <SummaryCard
          label="Needs Review"
          value={String(statusMap["NEEDS_REVIEW"] ?? 0)}
        />
        <SummaryCard
          label="Embedding Pending"
          value={String(embeddingPending[0]?.count ?? 0)}
        />
        <SummaryCard
          label="Embedding Failed"
          value={String(embeddingFailed[0]?.count ?? 0)}
        />
      </div>

      {/* Filter bar */}
      <form
        method="get"
        action="/knowledge/faq"
        className="flex flex-wrap items-end gap-2"
      >
        <div className="flex min-w-[200px] flex-1 flex-col gap-1">
          <span className="text-xs text-muted-foreground">Cari</span>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              defaultValue={q}
              placeholder="Kata kunci pertanyaan/jawaban…"
              className="pl-8"
            />
          </div>
        </div>
        <SelectField name="status" label="Status" value={status}>
          <option value="all">Semua</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {KNOWLEDGE_STATUS_LABEL[s] ?? s}
            </option>
          ))}
        </SelectField>
        <SelectField name="category" label="Kategori" value={category}>
          <option value="all">Semua</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
        <SelectField name="audience" label="Audiens" value={audience}>
          <option value="all">Semua</option>
          {AUDIENCE_OPTIONS.map((a) => (
            <option key={a} value={a}>
              {AUDIENCE_LABEL[a] ?? a}
            </option>
          ))}
        </SelectField>
        <SelectField name="source" label="Sumber" value={source}>
          <option value="all">Semua</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </SelectField>
        <SelectField name="embedding" label="Embedding" value={embedding}>
          <option value="all">Semua</option>
          {EMBEDDING_OPTIONS.map((e) => (
            <option key={e} value={e}>
              {EMBEDDING_STATUS_LABEL[e] ?? e}
            </option>
          ))}
        </SelectField>
        <SelectField
          name="pageSize"
          label="Per halaman"
          value={String(pageSize)}
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={String(n)}>
              {n}
            </option>
          ))}
        </SelectField>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/knowledge/faq">Reset</Link>
        </Button>
      </form>

      <FaqBulkTable
        items={tableItems}
        categories={categoryOptions}
        canWrite={canWrite}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Halaman {page} dari {totalPages} · {total} entri
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              asChild={page > 1}
            >
              {page > 1 ? (
                <Link href={hrefFor(page - 1)}>Sebelumnya</Link>
              ) : (
                <span>Sebelumnya</span>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              asChild={page < totalPages}
            >
              {page < totalPages ? (
                <Link href={hrefFor(page + 1)}>Berikutnya</Link>
              ) : (
                <span>Berikutnya</span>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-2xl font-semibold">{value}</CardContent>
    </Card>
  );
}

function SelectField({
  name,
  label,
  value,
  children,
}: {
  name: string;
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-[130px] flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <select
        name={name}
        defaultValue={value || "all"}
        className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {children}
      </select>
    </div>
  );
}
