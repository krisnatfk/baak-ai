import Link from "next/link";
import { Button } from "@/components/ui/button";

interface PaginationProps {
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
}

/** Pagination bersama untuk halaman daftar (server component). */
export function Pagination({ page, totalPages, buildHref }: PaginationProps) {
  if (totalPages <= 1) return null;

  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;

  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>
        Halaman {page} dari {totalPages}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={prevDisabled}
          asChild={!prevDisabled}
        >
          {!prevDisabled ? (
            <Link href={buildHref(page - 1)}>Sebelumnya</Link>
          ) : (
            <span>Sebelumnya</span>
          )}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={nextDisabled}
          asChild={!nextDisabled}
        >
          {!nextDisabled ? (
            <Link href={buildHref(page + 1)}>Berikutnya</Link>
          ) : (
            <span>Berikutnya</span>
          )}
        </Button>
      </div>
    </div>
  );
}
