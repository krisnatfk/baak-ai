"use client";

import { useState } from "react";
import { ChevronDown, FileJson } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AuditDetailData {
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
}

/** Tombol expand untuk melihat diff old/new data pada baris audit log. */
export function AuditLogDetail({ oldData, newData }: AuditDetailData) {
  const [open, setOpen] = useState(false);
  const hasData = oldData != null || newData != null;

  if (!hasData) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-expanded={open}
      >
        <FileJson className="size-3.5" />
        Detail data
        <ChevronDown
          className={cn("size-3.5 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {oldData != null && (
            <div className="space-y-1">
              <p className="text-[10px] font-medium uppercase tracking-wide text-destructive">
                Sebelum
              </p>
              <pre className="max-h-56 overflow-auto rounded-md border bg-muted/40 p-2 text-[11px] leading-relaxed">
                {JSON.stringify(oldData, null, 2)}
              </pre>
            </div>
          )}
          {newData != null && (
            <div className="space-y-1">
              <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                Sesudah
              </p>
              <pre className="max-h-56 overflow-auto rounded-md border bg-muted/40 p-2 text-[11px] leading-relaxed">
                {JSON.stringify(newData, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
