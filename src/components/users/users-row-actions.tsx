"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil } from "lucide-react";
import { setUserStatus } from "@/lib/server/actions/users";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  EditUserDialog,
  type RoleOption,
  type UserRow,
} from "@/components/users/user-dialog";

interface UsersRowActionsProps {
  user: UserRow;
  roles: RoleOption[];
  isSelf: boolean;
}

/** Aksi baris pengguna: edit + aktif/nonaktif (SUPER_ADMIN). */
export function UsersRowActions({
  user,
  roles,
  isSelf,
}: UsersRowActionsProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function toggleActive(checked: boolean) {
    setPending(true);
    const res = await setUserStatus(
      user.id,
      checked ? "ACTIVE" : "INACTIVE",
    );
    setPending(false);
    if (res.ok) toast.success(res.message);
    else toast.error(res.message);
    router.refresh();
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <EditUserDialog
        user={user}
        roles={roles}
        isSelf={isSelf}
        trigger={
          <Button variant="ghost" size="icon-sm" title="Edit pengguna">
            <Pencil className="size-4" />
          </Button>
        }
      />

      <Switch
        checked={user.status === "ACTIVE"}
        disabled={pending || isSelf}
        onCheckedChange={(checked) => void toggleActive(checked)}
        aria-label={
          user.status === "ACTIVE" ? "Nonaktifkan pengguna" : "Aktifkan pengguna"
        }
      />
      {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
    </div>
  );
}
