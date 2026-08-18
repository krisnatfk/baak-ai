"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Play } from "lucide-react";
import { drainEmbeddingQueue } from "@/lib/server/actions/faq-import";
import { Button } from "@/components/ui/button";

/** Proses antrian embedding (batch) dari dashboard FAQ. */
export function EmbeddingQueueButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const res = await drainEmbeddingQueue(20);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
      router.refresh();
    });
  }

  return (
    <Button variant="outline" disabled={pending} onClick={run}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
      Process Embedding
    </Button>
  );
}
