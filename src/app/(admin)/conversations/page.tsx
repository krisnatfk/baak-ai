import Link from "next/link";
import { desc, ilike, or } from "drizzle-orm";
import { MessagesSquare, Search } from "lucide-react";
import { db } from "@/db/client";
import { chatSessions } from "@/db/schema";
import { requireUser } from "@/lib/guards";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChatSessionStatusBadge } from "@/components/knowledge/badges";
import { Pagination } from "@/components/pagination";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

/** Hindari karakter wildcard `%` dan `_` menjadi pola tak terkontrol. */
function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (m) => `\\${m}`);
}

interface ConversationsPageProps {
  searchParams: Promise<{ q?: string; page?: string }>;
}

export default async function ConversationsPage({
  searchParams,
}: ConversationsPageProps) {
  await requireUser();
  const params = await searchParams;

  const q = (params.q ?? "").trim().slice(0, 100);
  const page = Math.max(1, Number(params.page) || 1);

  const where = q
    ? or(
        ilike(chatSessions.sessionId, `%${escapeLike(q)}%`),
        ilike(chatSessions.sender, `%${escapeLike(q)}%`),
        ilike(chatSessions.topic, `%${escapeLike(q)}%`),
      )
    : undefined;

  const [total, sessions] = await Promise.all([
    db.$count(chatSessions, where),
    db.query.chatSessions.findMany({
      where,
      orderBy: desc(chatSessions.lastMessageAt),
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      columns: {
        id: true,
        sessionId: true,
        sender: true,
        channel: true,
        topic: true,
        messageCount: true,
        status: true,
        lastMessageAt: true,
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildHref(p: number) {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return `/conversations${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Percakapan</h1>
        <p className="text-sm text-muted-foreground">
          {total} sesi percakapan terekam dari bot WhatsApp (chat memory).
        </p>
      </div>

      <form
        method="get"
        action="/conversations"
        className="flex items-center gap-2"
      >
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Cari sesi, pengirim, atau topik..."
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="outline" size="sm">
          Cari
        </Button>
      </form>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sesi</TableHead>
              <TableHead className="hidden md:table-cell">Pengirim</TableHead>
              <TableHead className="hidden lg:table-cell">Topik</TableHead>
              <TableHead className="text-right">Pesan</TableHead>
              <TableHead className="hidden md:table-cell">Terakhir Aktif</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                  Belum ada percakapan.
                </TableCell>
              </TableRow>
            ) : (
              sessions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link
                      href={`/conversations/${s.id}`}
                      className="flex items-center gap-2 font-medium hover:underline"
                    >
                      <MessagesSquare className="size-4 text-muted-foreground" />
                      <span className="max-w-[16rem] truncate">{s.sessionId}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="text-sm">{s.sender ?? "—"}</span>
                  </TableCell>
                  <TableCell className="hidden max-w-xs lg:table-cell">
                    <span className="line-clamp-1 text-sm text-muted-foreground">
                      {s.topic ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="text-sm tabular-nums">{s.messageCount}</span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="text-sm text-muted-foreground">
                      {s.lastMessageAt
                        ? s.lastMessageAt.toLocaleString("id-ID", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <ChatSessionStatusBadge status={s.status} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Pagination page={page} totalPages={totalPages} buildHref={buildHref} />
    </div>
  );
}
