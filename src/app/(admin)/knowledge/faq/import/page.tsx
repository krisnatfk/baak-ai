import Link from "next/link";
import { Download, History } from "lucide-react";
import { requireUser } from "@/lib/guards";
import { Button } from "@/components/ui/button";
import { FaqImportUpload } from "@/components/knowledge/faq-import-upload";

export const dynamic = "force-dynamic";

export default async function FaqImportPage() {
  const user = await requireUser();
  if (user.roleKey === "VIEWER") {
    return (
      <p className="text-sm text-muted-foreground">
        Anda tidak memiliki izin untuk mengimpor FAQ.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Import FAQ</h1>
          <p className="text-sm text-muted-foreground">
            Unggah file XLSX/CSV untuk menambah banyak FAQ sekaligus. Data akan
            di-parse, divalidasi, lalu ditampilkan sebagai preview sebelum
            diimpor.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <a href="/api/faq/import/template">
              <Download className="size-4" /> Download Template XLSX
            </a>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/knowledge/faq/import-history">
              <History className="size-4" /> Import History
            </Link>
          </Button>
        </div>
      </div>

      <FaqImportUpload />
    </div>
  );
}
