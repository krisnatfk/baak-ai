import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { unansweredQuestions } from "@/db/schema";
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
import { cn } from "@/lib/utils";
import { UnansweredStatusBadge } from "@/components/knowledge/badges";
import { UnansweredRowActions } from "@/components/unanswered/unanswered-row-actions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const STATUS_FILTERS = [
  { key: "", label: "Semua" },
  { key: "NEW", label: "Baru" },
  { key: "REVIEWED", label: "Ditinjau" },
  { key: "ANSWERED", label: "Dijawab" },
  { key: "ADDED_TO_KNOWLEDGE", label: "Masuk KB" },
  { key: "IGNORED", label: "Diabaikan" },
] as const;

interface UnansweredPageProps {
  searchParams: Promise<{ status?: string; page?: string }>;
}

function formatScore(value: string | null): string {
  if (value === null) return "—";
  const pct = Number(value) * 100;
  return `${Number.isFinite(pct) ? pct.toFixed(1) : "?"}%`;
}

export default async function UnansweredPage({
  searchParams,
}: UnansweredPageProps) {
  const user = await requireUser();
  const canWrite = user.roleKey !== "VIEWER";
  const params = await searchParams;

  const status = STATUS_FILTERS.some((f) => f.key === params.status)
    ? (params.status as (typeof STATUS_FILTERS)[number]["key"])
    : "";
  const page = Math.max(1, Number(params.page) || 1);

  const where = status ? eq(unansweredQuestions.status, status) : undefined;

  const [total, items] = await Promise.all([
    db.$count(unansweredQuestions, where),
    db.query.unansweredQuestions.findMany({
      where,
      orderBy: desc(unansweredQuestions.createdAt),
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      columns: {
        id: true,
        question: true,
        sender: true,
        sessionId: true,
        timesAsked: true,
        bestSimilarityScore: true,
        status: true,
        knowledgeId: true,
        createdAt: true,
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Pertanyaan Tidak Terjawab
          </h1>
          <p className="text-sm text-muted-foreground">
            {total} pertanyaan dari pengguna yang tidak berhasil dijawab bot —
            tinjau dan tambahkan ke knowledge base.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/unanswered?status=NEW">Lihat antrean baru</Link>
        </Button>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto">
        {STATUS_FILTERS.map((f) => {
          const href = f.key ? `/unanswered?status=${f.key}` : "/unanswered";
          const active = status === f.key;
          return (
            <Link
              key={f.key || "all"}
              href={href}
              className={cn(
                "inline-flex shrink-0 items-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pertanyaan</TableHead>
              <TableHead className="hidden md:table-cell">Pengirim</TableHead>
              <TableHead className="hidden lg:table-cell">Skor Terbaik</TableHead>
              <TableHead className="hidden lg:table-cell">Ditanya</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Dibuat</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                  Tidak ada pertanyaan dengan filter ini.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="max-w-md">
                    <div className="line-clamp-2 font-medium">{item.question}</div>
                    {item.sessionId && (
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        Sesi: {item.sessionId}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="text-sm">{item.sender ?? "—"}</span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <span className="text-sm tabular-nums">
                      {formatScore(item.bestSimilarityScore)}
                    </span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <span className="text-sm tabular-nums">{item.timesAsked}×</span>
                  </TableCell>
                  <TableCell>
                    <UnansweredStatusBadge status={item.status} />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="text-sm text-muted-foreground">
                      {item.createdAt.toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <UnansweredRowActions
                      id={item.id}
                      status={item.status}
                      knowledgeId={item.knowledgeId}
                      canWrite={canWrite}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Halaman {page} dari {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              asChild={page > 1}
            >
              {page > 1 ? (
                <Link
                  href={status ? `/unanswered?status=${status}&page=${page - 1}` : `/unanswered?page=${page - 1}`}
                >
                  Sebelumnya
                </Link>
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
                <Link
                  href={status ? `/unanswered?status=${status}&page=${page + 1}` : `/unanswered?page=${page + 1}`}
                >
                  Berikutnya
                </Link>
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
