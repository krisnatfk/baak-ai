"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, FileText, FolderKanban, History, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "faq", label: "FAQ", href: "/knowledge/faq", icon: BookOpen },
  {
    key: "categories",
    label: "Kategori",
    href: "/knowledge/categories",
    icon: FolderKanban,
  },
  {
    key: "sources",
    label: "Sumber",
    href: "/knowledge/sources",
    icon: Layers,
  },
  {
    key: "documents",
    label: "Dokumen",
    href: "/knowledge/documents",
    icon: FileText,
  },
  {
    key: "import-history",
    label: "Import History",
    href: "/knowledge/faq/import-history",
    icon: History,
  },
] as const;

/** Sub-navigasi seksi Knowledge Base (FAQ / Kategori / Sumber / Dokumen). */
export function KnowledgeNav() {
  const pathname = usePathname();

  return (
    <nav className="-mb-px flex items-center gap-1 overflow-x-auto border-b">
      {TABS.map((tab) => {
        const active =
          pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <tab.icon className="size-4" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
