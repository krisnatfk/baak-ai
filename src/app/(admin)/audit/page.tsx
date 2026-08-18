import { and, desc, eq } from "drizzle-orm";
import { ScrollText } from "lucide-react";
import { db } from "@/db/client";
import { auditLogs } from "@/db/schema";
import { requireRole } from "@/lib/guards";
import { cn } from "@/lib/utils";
import { Pagination } from "@/components/pagination";
import { AuditLogDetail } from "@/components/audit/audit-log-detail";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export const AUDIT_ENTITY_LABEL: Record<string, string> = {
  CATEGORY: "Kategori",
  SOURCE: "Sumber",
  FAQ: "FAQ",
  USER: "Pengguna",
  ROLE: "Peran",
  UNANSWERED: "Tak Terjawab",
  HANDOFF: "Handoff",
  DOCUMENT: "Dokumen",
};

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  CREATE: "Buat",
  UPDATE: "Ubah",
  DELETE: "Hapus",
  ACTIVATE: "Aktifkan",
  DEACTIVATE: "Nonaktifkan",
  RESTORE: "Pulihkan",
  STATUS_CHANGE: "Ubah status",
  ASSIGN: "Tugaskan",
  RESOLVE: "Selesaikan",
  REVIEW: "Tinjau",
  RETRY_EMBEDDING: "Retry embedding",
  LOGIN: "Masuk",
  LOGOUT: "Keluar",
  UPLOAD: "Unggah",
  CHUNK: "Chunking",
  PROCESS: "Proses",
  EXPORT: "Ekspor",
};

/** Warna badge aksi — dikelompokkan agar mudah dipindai. */
function actionClasses(action: string): string {
  if (action === "CREATE" || action === "ACTIVATE" || action === "RESTORE") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  }
  if (action === "DELETE" || action === "DEACTIVATE") {
    return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400";
  }
  if (action === "LOGIN" || action === "LOGOUT") {
    return "border-transparent bg-muted text-muted-foreground";
  }
  return "border-primary/20 bg-primary/10 text-primary";
}

interface AuditPageProps {
  searchParams: Promise<{ entity?: string; action?: string; page?: string }>;
}

export default async function AuditLogPage({ searchParams }: AuditPageProps) {
  await requireRole("SUPER_ADMIN");
  const params = await searchParams;

  const entity =
    params.entity && params.entity in AUDIT_ENTITY_LABEL ? params.entity : "";
  const action =
    params.action && params.action in AUDIT_ACTION_LABEL ? params.action : "";
  const page = Math.max(1, Number(params.page) || 1);

  const where = and(
    entity ? eq(auditLogs.entity, entity) : undefined,
    action ? eq(auditLogs.action, action) : undefined,
  );

  const [total, items] = await Promise.all([
    db.$count(auditLogs, where),
    db.query.auditLogs.findMany({
      where,
      orderBy: desc(auditLogs.createdAt),
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      columns: {
        id: true,
        userEmail: true,
        action: true,
        entity: true,
        entityId: true,
        oldData: true,
        newData: true,
        ip: true,
        createdAt: true,
      },
      with: { user: { columns: { id: true, name: true, email: true } } },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildHref(p: number) {
    const sp = new URLSearchParams();
    if (entity) sp.set("entity", entity);
    if (action) sp.set("action", action);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return `/audit${qs ? `?${qs}` : ""}`;
  }

  const entityOptions = Object.entries(AUDIT_ENTITY_LABEL);
  const actionOptions = Object.entries(AUDIT_ACTION_LABEL);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Audit Log</h1>
        <p className="text-sm text-muted-foreground">
          Jejak lengkap aktivitas admin: {total} entri tercatat.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-center gap-2">
        <select
          name="entity"
          defaultValue={entity}
          className="h-9 w-48 rounded-md border bg-transparent px-3 text-sm"
          aria-label="Filter entitas"
        >
          <option value="">Semua entitas</option>
          {entityOptions.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          name="action"
          defaultValue={action}
          className="h-9 w-48 rounded-md border bg-transparent px-3 text-sm"
          aria-label="Filter aksi"
        >
          <option value="">Semua aksi</option>
          {actionOptions.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Terapkan filter
        </button>
        {(entity || action) && (
          <a
            href="/audit"
            className="inline-flex h-9 items-center rounded-md px-3 text-sm text-muted-foreground hover:text-foreground"
          >
            Reset
          </a>
        )}
      </form>

      <div className="rounded-lg border bg-card">
        <table className="w-full">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Waktu</th>
              <th className="px-3 py-2 font-medium">Pengguna</th>
              <th className="px-3 py-2 font-medium">Entitas</th>
              <th className="px-3 py-2 font-medium">Aksi</th>
              <th className="px-3 py-2 font-medium">Detail</th>
              <th className="hidden px-3 py-2 font-medium lg:table-cell">IP</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  Tidak ada audit log dengan filter ini.
                </td>
              </tr>
            ) : (
              items.map((log) => (
                <tr key={log.id} className="border-b align-top last:border-0">
                  <td className="whitespace-nowrap px-3 py-2.5 text-sm tabular-nums">
                    {log.createdAt.toLocaleString("id-ID", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-sm font-medium">
                      {log.user?.name ?? "Sistem"}
                    </span>
                    {log.userEmail && (
                      <div className="text-xs text-muted-foreground">
                        {log.userEmail}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
                        "border-border bg-muted text-muted-foreground",
                      )}
                    >
                      {AUDIT_ENTITY_LABEL[log.entity] ?? log.entity}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
                        actionClasses(log.action),
                      )}
                    >
                      {AUDIT_ACTION_LABEL[log.action] ?? log.action}
                    </span>
                  </td>
                  <td className="min-w-48 px-3 py-2.5">
                    {log.entityId && (
                      <div className="mb-1 font-mono text-[11px] text-muted-foreground">
                        {log.entityId}
                      </div>
                    )}
                    <AuditLogDetail
                      oldData={log.oldData}
                      newData={log.newData}
                    />
                  </td>
                  <td className="hidden px-3 py-2.5 font-mono text-xs text-muted-foreground lg:table-cell">
                    {log.ip ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} buildHref={buildHref} />

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ScrollText className="size-3.5" />
        Audit log hanya dapat dilihat oleh SUPER_ADMIN dan tidak dapat diubah.
      </p>
    </div>
  );
}
