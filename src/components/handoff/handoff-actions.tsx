"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, ChevronDown, Loader2, PlayCircle, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { assignHandoff, setHandoffStatus } from "@/lib/server/actions/handoff";
import type { HandoffManualStatus } from "@/lib/server/actions/handoff";
import { HANDOFF_STATUS_LABEL } from "@/components/knowledge/badges";

export interface HandoffAdminOption {
  id: string;
  name: string;
}

interface HandoffActionsProps {
  id: string;
  status: string;
  assigneeId: string | null;
  admins: HandoffAdminOption[];
}

/** Aksi detail handoff: tugaskan ke admin + transisi status. */
export function HandoffActions({
  id,
  status,
  assigneeId,
  admins,
}: HandoffActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(next: HandoffManualStatus) {
    startTransition(async () => {
      const res = await setHandoffStatus(id, next);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
      router.refresh();
    });
  }

  function onAssign(adminId: string) {
    if (adminId === assigneeId) return;
    startTransition(async () => {
      const res = await assignHandoff(id, adminId);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
      router.refresh();
    });
  }

  const terminal = status === "RESOLVED" || status === "CLOSED";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!terminal ? (
        <Select
          value={assigneeId ?? undefined}
          onValueChange={onAssign}
          disabled={pending}
        >
          <SelectTrigger className="w-48" aria-label="Tugaskan ke admin">
            <SelectValue placeholder="Tugaskan ke admin…" />
          </SelectTrigger>
          <SelectContent>
            {admins.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span className="text-sm text-muted-foreground">
          Ditugaskan ke{" "}
          <span className="font-medium text-foreground">
            {admins.find((a) => a.id === assigneeId)?.name ?? "—"}
          </span>
        </span>
      )}

      {!terminal && status === "OPEN" && (
        <Button variant="outline" size="sm" disabled={pending} onClick={() => run("IN_PROGRESS")}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />}
          Mulai proses
        </Button>
      )}

      {!terminal && status === "ASSIGNED" && (
        <Button variant="outline" size="sm" disabled={pending} onClick={() => run("IN_PROGRESS")}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />}
          Mulai proses
        </Button>
      )}

      {!terminal && status !== "OPEN" && (
        <Button variant="outline" size="sm" disabled={pending} onClick={() => run("OPEN")}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
          Buka kembali
        </Button>
      )}

      {!terminal && (
        <Button variant="default" size="sm" disabled={pending} onClick={() => run("RESOLVED")}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
          Selesaikan
        </Button>
      )}

      {!terminal && (
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => run("CLOSED")}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
          Tutup
        </Button>
      )}

      {terminal && (
        <Button variant="outline" size="sm" disabled={pending} onClick={() => run("OPEN")}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
          Buka kembali
        </Button>
      )}

      {terminal && status === "RESOLVED" && (
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => run("CLOSED")}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
          Tutup
        </Button>
      )}
    </div>
  );
}

interface HandoffRowActionsProps {
  id: string;
  status: string;
  assigneeId: string | null;
  admins: HandoffAdminOption[];
}

/** Aksi kompak untuk baris tabel handoff (dropdown). */
export function HandoffRowActions({
  id,
  status,
  assigneeId,
  admins,
}: HandoffRowActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(next: HandoffManualStatus) {
    startTransition(async () => {
      const res = await setHandoffStatus(id, next);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
      router.refresh();
    });
  }

  function onAssign(adminId: string) {
    if (adminId === assigneeId) return;
    startTransition(async () => {
      const res = await assignHandoff(id, adminId);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
      router.refresh();
    });
  }

  const terminal = status === "RESOLVED" || status === "CLOSED";
  const current = admins.find((a) => a.id === assigneeId);

  return (
    <div className="flex items-center justify-end gap-2">
      {!terminal && (
        <Select
          value={assigneeId ?? undefined}
          onValueChange={onAssign}
          disabled={pending}
        >
          <SelectTrigger className="h-8 w-40" aria-label="Tugaskan ke admin">
            <SelectValue placeholder="Tugaskan…" />
          </SelectTrigger>
          <SelectContent>
            {admins.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" disabled={pending}>
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                {HANDOFF_STATUS_LABEL[status] ?? status}
                <ChevronDown className="size-4" />
              </>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Ubah status</DropdownMenuLabel>
          {!terminal && status === "OPEN" && (
            <DropdownMenuItem onClick={() => run("IN_PROGRESS")}>
              <PlayCircle className="size-4" /> Mulai proses
            </DropdownMenuItem>
          )}
          {!terminal && status === "ASSIGNED" && (
            <DropdownMenuItem onClick={() => run("IN_PROGRESS")}>
              <PlayCircle className="size-4" /> Mulai proses
            </DropdownMenuItem>
          )}
          {!terminal && status === "IN_PROGRESS" && (
            <DropdownMenuItem onClick={() => run("OPEN")}>
              <RotateCcw className="size-4" /> Buka kembali
            </DropdownMenuItem>
          )}
          {!terminal && status !== "OPEN" && status !== "IN_PROGRESS" && (
            <DropdownMenuItem onClick={() => run("OPEN")}>
              <RotateCcw className="size-4" /> Buka kembali
            </DropdownMenuItem>
          )}
          {!terminal && (
            <DropdownMenuItem onClick={() => run("RESOLVED")}>
              <CheckCircle2 className="size-4" /> Selesaikan
            </DropdownMenuItem>
          )}
          {!terminal && (
            <DropdownMenuItem onClick={() => run("CLOSED")}>
              <XCircle className="size-4" /> Tutup
            </DropdownMenuItem>
          )}
          {terminal && (
            <DropdownMenuItem onClick={() => run("OPEN")}>
              <RotateCcw className="size-4" /> Buka kembali
            </DropdownMenuItem>
          )}
          {terminal && status === "RESOLVED" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => run("CLOSED")}>
                <XCircle className="size-4" /> Tutup
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {current && !terminal && (
        <span className="text-xs text-muted-foreground">{current.name}</span>
      )}
    </div>
  );
}
