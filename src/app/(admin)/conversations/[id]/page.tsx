import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { ArrowLeft, Bot, MessageSquare, Terminal } from "lucide-react";
import { db } from "@/db/client";
import { chatMessages, chatSessions, retrievalLogs } from "@/db/schema";
import { requireUser } from "@/lib/guards";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ChatSessionStatusBadge,
  ConfidenceBadge,
} from "@/components/knowledge/badges";

export const dynamic = "force-dynamic";

interface ConversationDetailProps {
  params: Promise<{ id: string }>;
}

function roleMeta(role: string): { label: string; icon: typeof Bot; classes: string } {
  switch (role) {
    case "AI":
      return {
        label: "BAAK AI",
        icon: Bot,
        classes:
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
      };
    case "SYSTEM":
      return { label: "Sistem", icon: Terminal, classes: "bg-muted text-muted-foreground" };
    default:
      return {
        label: "User",
        icon: MessageSquare,
        classes: "bg-primary/10 text-primary",
      };
  }
}

export default async function ConversationDetailPage({
  params,
}: ConversationDetailProps) {
  await requireUser();
  const { id } = await params;

  const session = await db.query.chatSessions.findFirst({
    where: eq(chatSessions.id, id),
    columns: {
      id: true,
      sessionId: true,
      sender: true,
      channel: true,
      topic: true,
      messageCount: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      lastMessageAt: true,
    },
  });
  if (!session) notFound();

  const [messages, retrievals] = await Promise.all([
    db.query.chatMessages.findMany({
      where: eq(chatMessages.sessionId, id),
      orderBy: (t, { asc }) => asc(t.createdAt),
      columns: { id: true, role: true, content: true, createdAt: true },
    }),
    db.query.retrievalLogs.findMany({
      where: eq(retrievalLogs.sessionId, session.sessionId),
      orderBy: desc(retrievalLogs.createdAt),
      limit: 50,
      columns: {
        id: true,
        query: true,
        topScore: true,
        confidence: true,
        resultCount: true,
        createdAt: true,
      },
    }),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" asChild className="-ml-2 mb-1">
            <Link href="/conversations">
              <ArrowLeft className="size-4" /> Kembali
            </Link>
          </Button>
          <h1 className="text-xl font-semibold tracking-tight">
            {session.sessionId}
          </h1>
          <p className="text-sm text-muted-foreground">
            {session.sender ?? "Tanpa pengirim"} · {session.channel} ·{" "}
            {session.messageCount} pesan
          </p>
        </div>
        <ChatSessionStatusBadge status={session.status} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Transkrip Pesan</CardTitle>
            </CardHeader>
            <CardContent className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
              {messages.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Belum ada pesan terekam.
                </p>
              ) : (
                messages.map((m) => {
                  const meta = roleMeta(m.role);
                  const Icon = meta.icon;
                  return (
                    <div key={m.id} className="flex items-start gap-3">
                      <div
                        className={cn(
                          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md",
                          meta.classes,
                        )}
                      >
                        <Icon className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-semibold">{meta.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {m.createdAt.toLocaleString("id-ID", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap text-sm">{m.content}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Detail Sesi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Sesi ID</span>
                <span className="max-w-[14rem] truncate font-mono text-xs">{session.sessionId}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Pengirim</span>
                <span>{session.sender ?? "—"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Kanal</span>
                <span>{session.channel}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Topik</span>
                <span className="max-w-[12rem] truncate">{session.topic ?? "—"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Dibuat</span>
                <span>{session.createdAt.toLocaleDateString("id-ID")}</span>
              </div>
              {session.lastMessageAt && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Aktif terakhir</span>
                  <span>
                    {session.lastMessageAt.toLocaleString("id-ID", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Metadata Retrieval</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {retrievals.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Tidak ada log retrieval untuk sesi ini.
                </p>
              ) : (
                retrievals.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-md border p-2.5 text-sm"
                  >
                    <p className="line-clamp-1 font-medium">{r.query}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <ConfidenceBadge confidence={r.confidence ?? "LOW"} />
                      <span className="tabular-nums">
                        skor {(Number(r.topScore) * 100).toFixed(1)}%
                      </span>
                      <span>{r.resultCount} hasil</span>
                      <span>
                        {r.createdAt.toLocaleString("id-ID", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
