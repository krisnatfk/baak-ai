"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, Pencil, Trash2 } from "lucide-react";
import { bulkFaqAction } from "@/lib/server/actions/faq-import";
import { Button } from "@/components/ui/button";

/** Aksi review FAQ hasil generate: Publish, Edit, Hapus. */
export function GeneratedFaqActions({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  function run(action: string, payload?: Record<string, unknown>) {
    setPending(action);
    void (async () => {
      const res = await bulkFaqAction({ ids: [id], action, ...payload });
      setPending(null);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
      router.refresh();
    })();
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        title="Publish"
        disabled={pending !== null}
        onClick={() => run("publish")}
      >
        {pending === "publish" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Check className="size-4 text-emerald-600" />
        )}
      </Button>
      <Button variant="ghost" size="icon-sm" asChild title="Edit FAQ">
        <Link href={`/knowledge/faq/${id}/edit`}>
          <Pencil className="size-4" />
        </Link>
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        title="Hapus"
        disabled={pending !== null}
        onClick={() => run("delete")}
      >
        {pending === "delete" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Trash2 className="size-4 text-destructive" />
        )}
      </Button>
    </div>
  );
}
