import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Handshake, MessageCircle } from "lucide-react";
import { db } from "@/db/client";
import { humanHandoffs } from "@/db/schema";
import { requireRole } from "@/lib/guards";
import { cn } from "@/lib/utils";
import { Pagination } from "@/components/pagination";
import { HandoffStatusBadge } from "@/components/knowledge/badges";
import { HandoffRowActions } from "@/components/handoff/handoff-actions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const STATUS_FILTERS = [
  { key: "", label: "Semua" },
  { key: "OPEN", label: "Terbuka" },
  { key: "ASSIGNED", label: "Ditugaskan" },
  { key: "IN_PROGRESS", label: "Sedang Diproses" },
  { key: "RESOLVED", label: "Terselesaikan" },
  { key: "CLOSED", label: "Ditutup" },
] as const;

interface HandoffPageProps {
  searchParams: Promise<{ status?: string; page?: string }>;
}

export default async function HandoffPage({
  searchParams,
}: HandoffPageProps) {
  await requireRole("ADMIN", "SUPER_ADMIN");
  const params = await searchParams;

  const status = STATUS_FILTERS.some((f) => f.key === params.status)
    ? (params.status as (typeof STATUS_FILTERS)[number]["key"])
    : "";
  const page = Math.max(1, Number(params.page) || 1);

  const where = status ? eq(humanHandoffs.status, status) : undefined;

  const [total, items, adminRoles] = await Promise.all([
    db.$count(humanHandoffs, where),
    db.query.humanHandoffs.findMany({
      where,
      orderBy: desc(humanHandoffs.createdAt),
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      columns: {
        id: true,
        sender: true,
        question: true,
        reason: true,
        status: true,
        assignedAdminId: true,
        createdAt: true,
      },
      with: {
        assignedAdmin: { columns: { id: true, name: true } },
        chatSession: { columns: { id: true, sessionId: true } },
      },
    }),
    db.query.roles.findMany({
      where: (t, { inArray: ia }) =>
        ia(t.key, ["ADMIN", "SUPER_ADMIN"] as string[]),
      columns: { id: true, key: true },
    }),
  ]);

  // Daftar admin aktif untuk dropdown penugasan.
  const adminRoleIds = adminRoles.map((r) => r.id);
  const admins = await db.query.users.findMany({
    where: (t, { and: a, eq: e, inArray: ia }) =>
      a(
        e(t.status, "ACTIVE"),
        adminRoleIds.length > 0 ? ia(t.roleId, adminRoleIds) : undefined,
      ),
    columns: { id: true, name: true },
    orderBy: (t, { asc }) => asc(t.name),
  });

  const adminOptions = admins.map((a) => ({ id: a.id, name: a.name }));
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildHref(p: number) {
    const sp = new URLSearchParams();
    if (status) sp.set("status", status);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return `/handoff${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Handoff Manusia</h1>
        <p className="text-sm text-muted-foreground">
          {total} permintaan yang dialihkan dari bot WhatsApp ke petugas BAAK.
        </p>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto">
        {STATUS_FILTERS.map((f) => {
          const href = f.key ? `/handoff?status=${f.key}` : "/handoff";
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
        <table className="w-full">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Pertanyaan</th>
              <th className="hidden px-3 py-2 font-medium md:table-cell">Pengirim</th>
              <th className="hidden px-3 py-2 font-medium lg:table-cell">Alasan</th>
              <th className="hidden px-3 py-2 font-medium md:table-cell">Sesi</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                  Tidak ada handoff dengan filter ini.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="max-w-md px-3 py-2.5">
                    <Link
                      href={`/handoff/${item.id}`}
                      className="flex items-start gap-2 font-medium hover:underline"
                    >
                      <Handshake className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <span className="line-clamp-2">{item.question}</span>
                    </Link>
                  </td>
                  <td className="hidden px-3 py-2.5 text-sm md:table-cell">
                    {item.sender ?? "—"}
                  </td>
                  <td className="hidden max-w-xs px-3 py-2.5 lg:table-cell">
                    <span className="line-clamp-1 text-sm text-muted-foreground">
                      {item.reason ?? "—"}
                    </span>
                  </td>
                  <td className="hidden max-w-[10rem] px-3 py-2.5 md:table-cell">
                    {item.chatSession ? (
                      <Link
                        href={`/conversations/${item.chatSession.id}`}
                        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:underline"
                      >
                        <MessageCircle className="size-3.5" />
                        <span className="truncate">{item.chatSession.sessionId}</span>
                      </Link>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <HandoffStatusBadge status={item.status} />
                  </td>
                  <td className="px-3 py-2.5">
                    <HandoffRowActions
                      id={item.id}
                      status={item.status}
                      assigneeId={item.assignedAdminId}
                      admins={adminOptions}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} buildHref={buildHref} />
    </div>
  );
}
