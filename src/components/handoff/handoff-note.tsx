"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { saveHandoffNote } from "@/lib/server/actions/handoff";

interface HandoffNoteProps {
  id: string;
  note: string | null;
}

/** Editor catatan internal handoff (tidak mengubah status). */
export function HandoffNote({ id, note }: HandoffNoteProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(note ?? "");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const res = await saveHandoffNote(id, value);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <Label htmlFor="handoff-note">Catatan internal</Label>
      <Textarea
        id="handoff-note"
        rows={4}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ringkasan penanganan untuk petugas lain…"
      />
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending || value === (note ?? "")}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Simpan catatan
        </Button>
      </div>
    </form>
  );
}
