import { Plus, ShieldCheck } from "lucide-react";
import { db } from "@/db/client";
import { requireRole } from "@/lib/guards";
import { UserStatusBadge } from "@/components/knowledge/badges";
import { Button } from "@/components/ui/button";
import {
  CreateUserDialog,
  type RoleOption,
  type UserRow,
} from "@/components/users/user-dialog";
import { UsersRowActions } from "@/components/users/users-row-actions";

export const dynamic = "force-dynamic";

function formatLastLogin(value: string | null): string {
  if (!value) return "Belum pernah";
  const d = new Date(value);
  return d.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function UsersPage() {
  const actor = await requireRole("SUPER_ADMIN");

  const [userRows, roleRows] = await Promise.all([
    db.query.users.findMany({
      orderBy: (t, { asc }) => asc(t.name),
      columns: {
        id: true,
        name: true,
        email: true,
        roleId: true,
        status: true,
        lastLoginAt: true,
      },
      with: { role: { columns: { key: true, name: true } } },
    }),
    db.query.roles.findMany({
      orderBy: (t, { asc }) => asc(t.name),
      columns: { id: true, key: true, name: true },
    }),
  ]);

  const roleOptions: RoleOption[] = roleRows.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
  }));

  const rows: UserRow[] = userRows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    roleId: u.roleId,
    roleKey: u.role?.key ?? "",
    roleName: u.role?.name ?? "—",
    status: u.status,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
  }));

  const activeCount = rows.filter((r) => r.status === "ACTIVE").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Pengguna</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} akun tim BAAK ({activeCount} aktif). Manajemen akun
            hanya untuk SUPER_ADMIN.
          </p>
        </div>
        <CreateUserDialog
          roles={roleOptions}
          trigger={
            <Button>
              <Plus className="size-4" /> Tambah Pengguna
            </Button>
          }
        />
      </div>

      <div className="rounded-lg border bg-card">
        <table className="w-full">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Nama</th>
              <th className="hidden px-3 py-2 font-medium sm:table-cell">Email</th>
              <th className="hidden px-3 py-2 font-medium md:table-cell">Peran</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="hidden px-3 py-2 font-medium lg:table-cell">
                Terakhir Masuk
              </th>
              <th className="px-3 py-2 text-right font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                  Belum ada pengguna.
                </td>
              </tr>
            ) : (
              rows.map((u) => {
                const isSelf = u.id === actor.id;
                return (
                  <tr key={u.id} className="border-b align-middle last:border-0">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {u.name
                            .split(/\s+/)
                            .map((p) => p[0])
                            .slice(0, 2)
                            .join("")
                            .toUpperCase()}
                        </div>
                        <span className="font-medium">{u.name}</span>
                        {isSelf && (
                          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            Anda
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="hidden px-3 py-2.5 text-sm sm:table-cell">
                      {u.email}
                    </td>
                    <td className="hidden px-3 py-2.5 md:table-cell">
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        {u.roleKey === "SUPER_ADMIN" && (
                          <ShieldCheck className="size-3.5 text-primary" />
                        )}
                        {u.roleName}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <UserStatusBadge status={u.status} />
                    </td>
                    <td className="hidden px-3 py-2.5 text-sm text-muted-foreground lg:table-cell">
                      {formatLastLogin(u.lastLoginAt)}
                    </td>
                    <td className="px-3 py-2.5">
                      <UsersRowActions user={u} roles={roleOptions} isSelf={isSelf} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Akun SUPER_ADMIN terakhir tidak dapat dinonaktifkan atau diturunkan
        perannya agar panel tidak terkunci. Semua perubahan dicatat di audit
        log.
      </p>
    </div>
  );
}
