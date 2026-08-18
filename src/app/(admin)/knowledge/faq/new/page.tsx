import Link from "next/link";
import { redirect } from "next/navigation";
import { eq, and, isNull } from "drizzle-orm";
import { Info } from "lucide-react";
import { db } from "@/db/client";
import { unansweredQuestions, knowledgeItems } from "@/db/schema";
import { requireUser } from "@/lib/guards";
import { FaqForm } from "@/components/knowledge/faq-form";
import { UnansweredStatusBadge } from "@/components/knowledge/badges";

export const dynamic = "force-dynamic";

interface NewFaqPageProps {
  searchParams: Promise<{ unanswered?: string }>;
}

export default async function NewFaqPage({ searchParams }: NewFaqPageProps) {
  const user = await requireUser();
  if (user.roleKey === "VIEWER") redirect("/knowledge/faq");

  const params = await searchParams;
  const unansweredId = params.unanswered?.trim() ?? "";

  // Alur auto-fill dari halaman "Pertanyaan Tidak Terjawab".
  const unanswered = unansweredId
    ? await db.query.unansweredQuestions.findFirst({
        where: eq(unansweredQuestions.id, unansweredId),
        columns: {
          id: true,
          question: true,
          status: true,
          sender: true,
          timesAsked: true,
          bestSimilarityScore: true,
        },
      })
    : null;

  // Kalau sudah masuk KB atau diabaikan, jangan biarkan menimpa.
  if (unansweredId && unanswered && !["NEW", "REVIEWED"].includes(unanswered.status)) {
    redirect("/unanswered");
  }

  const [categories, sources, relatedFaqs] = await Promise.all([
    db.query.knowledgeCategories.findMany({
      columns: { id: true, name: true },
      orderBy: (t, { asc }) => asc(t.name),
    }),
    db.query.knowledgeSources.findMany({
      columns: { id: true, title: true, type: true },
      orderBy: (t, { asc }) => asc(t.title),
    }),
    // FAQ AKTIF lain — pilihan "Pertanyaan Terkait" (bagian C).
    db.query.knowledgeItems.findMany({
      where: and(
        eq(knowledgeItems.status, "ACTIVE"),
        isNull(knowledgeItems.deletedAt),
      ),
      columns: { id: true, question: true },
      orderBy: (t, { asc }) => asc(t.question),
      limit: 200,
    }),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Tambah FAQ</h1>
        <p className="text-sm text-muted-foreground">
          FAQ baru akan berstatus DRAFT (atau status pilihan) dan diantrekan
          untuk di-embedding.
        </p>
      </div>

      {unanswered && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium">Dari pertanyaan tidak terjawab:</span>
            <span className="text-muted-foreground">{unanswered.question}</span>
            <UnansweredStatusBadge status={unanswered.status} />
            <span className="text-xs text-muted-foreground">
              ditanya {unanswered.timesAsked}×
              {unanswered.sender ? ` · ${unanswered.sender}` : ""}
              {unanswered.bestSimilarityScore !== null
                ? ` · skor ${(Number(unanswered.bestSimilarityScore) * 100).toFixed(1)}%`
                : ""}
            </span>
            <Link
              href="/unanswered"
              className="text-xs underline underline-offset-2 hover:text-foreground"
            >
              Lihat daftar
            </Link>
          </div>
        </div>
      )}

      <FaqForm
        mode="create"
        categories={categories}
        sources={sources}
        relatedFaqs={relatedFaqs}
        unansweredId={unanswered?.id}
        defaultValues={
          unanswered
            ? {
                question: unanswered.question,
                answer: "",
                categoryId: null,
                audience: "MAHASISWA",
                keywords: [],
                sourceId: null,
                sourceUrl: "",
                status: "DRAFT",
                internalNote: `Diisi otomatis dari pertanyaan tidak terjawab (${unanswered.id}).`,
                alternatives: [],
                sources: [],
                relatedQuestions: [],
                media: [],
                attachments: [],
              }
            : undefined
        }
      />
    </div>
  );
}
