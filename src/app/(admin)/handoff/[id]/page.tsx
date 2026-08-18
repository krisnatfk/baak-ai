import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft, MessageCircle, MessageSquare, Timer, UserCheck } from "lucide-react";
import { db } from "@/db/client";
import { humanHandoffs } from "@/db/schema";
import { requireRole } from "@/lib/guards";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HandoffStatusBadge } from "@/components/knowledge/badges";
import { HandoffActions } from "@/components/handoff/handoff-actions";
import { HandoffNote } from "@/components/handoff/handoff-note";

export const dynamic = "force-dynamic";

interface HandoffDetailProps {
  params: Promise<{ id: string }>;
}

function formatDateTime(d: Date): string {
  return d.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function HandoffDetailPage({
  params,
}: HandoffDetailProps) {
  await requireRole("ADMIN", "SUPER_ADMIN");
  const { id } = await params;

  const handoff = await db.query.humanHandoffs.findFirst({
    where: eq(humanHandoffs.id, id),
    with: {
      chatSession: { columns: { id: true, sessionId: true } },
      assignedAdmin: { columns: { id: true, name: true, email: true } },
      resolvedByUser: { columns: { id: true, name: true } },
    },
  });
  if (!handoff) notFound();

  // Daftar admin aktif untuk dropdown penugasan.
  const adminRoles = await db.query.roles.findMany({
    where: (t, { inArray }) => inArray(t.key, ["ADMIN", "SUPER_ADMIN"] as string[]),
    columns: { id: true },
  });
  const admins = await db.query.users.findMany({
    where: (t, { and, eq: e, inArray }) =>
      and(
        e(t.status, "ACTIVE"),
        inArray(t.roleId, adminRoles.map((r) => r.id)),
      ),
    columns: { id: true, name: true },
    orderBy: (t, { asc }) => asc(t.name),
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-1">
          <Link href="/handoff">
            <ArrowLeft className="size-4" /> Kembali
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Detail Handoff</h1>
          <HandoffStatusBadge status={handoff.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          Dari {handoff.sender ?? "pengirim tak dikenal"} ·{" "}
          {formatDateTime(handoff.createdAt)}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Permintaan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Pertanyaan
                </span>
                <p className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm">
                  {handoff.question}
                </p>
              </div>
              {handoff.reason && (
                <div className="space-y-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Alasan pengalihan
                  </span>
                  <p className="text-sm">{handoff.reason}</p>
                </div>
              )}
              {handoff.chatSession && (
                <div className="space-y-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Sesi WhatsApp
                  </span>
                  <Link
                    href={`/conversations/${handoff.chatSession.id}`}
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                  >
                    <MessageCircle className="size-4" />
                    {handoff.chatSession.sessionId}
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Penanganan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <HandoffActions
                id={handoff.id}
                status={handoff.status}
                assigneeId={handoff.assignedAdminId}
                admins={admins.map((a) => ({ id: a.id, name: a.name }))}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-start gap-2 rounded-md border p-3 text-sm">
                  <UserCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="space-y-0.5">
                    <div className="text-xs text-muted-foreground">Petugas</div>
                    <div className="font-medium">
                      {handoff.assignedAdmin?.name ?? "Belum ditugaskan"}
                    </div>
                    {handoff.assignedAdmin?.email && (
                      <div className="text-xs text-muted-foreground">
                        {handoff.assignedAdmin.email}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-2 rounded-md border p-3 text-sm">
                  <Timer className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="space-y-0.5">
                    <div className="text-xs text-muted-foreground">Diselesaikan</div>
                    {handoff.resolvedAt ? (
                      <>
                        <div className="font-medium">
                          {formatDateTime(handoff.resolvedAt)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          oleh {handoff.resolvedByUser?.name ?? "—"}
                        </div>
                      </>
                    ) : (
                      <div className="font-medium text-muted-foreground">Belum</div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="self-start">
          <CardHeader>
            <CardTitle className="text-sm">
              <MessageSquare className="mr-1 inline size-4" />
              Catatan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <HandoffNote id={handoff.id} note={handoff.note} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
