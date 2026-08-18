import { and, eq, isNull, ne } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db/client";
import { knowledgeItems } from "@/db/schema";
import { requireUser } from "@/lib/guards";
import { FaqForm } from "@/components/knowledge/faq-form";
import type { FaqFormValues } from "@/lib/knowledge-schema";

export const dynamic = "force-dynamic";

interface EditFaqPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditFaqPage({ params }: EditFaqPageProps) {
  const { id } = await params;
  const user = await requireUser();
  if (user.roleKey === "VIEWER") redirect("/knowledge/faq");

  const [faq, categories, sources, relatedFaqs] = await Promise.all([
    db.query.knowledgeItems.findFirst({
      where: and(eq(knowledgeItems.id, id), isNull(knowledgeItems.deletedAt)),
      columns: {
        id: true,
        question: true,
        answer: true,
        categoryId: true,
        audience: true,
        keywords: true,
        sourceId: true,
        sourceUrl: true,
        status: true,
        internalNote: true,
      },
      with: {
        alternatives: { columns: { question: true } },
        itemSources: { columns: { title: true, type: true, url: true } },
        relatedQuestions: {
          columns: { relatedKnowledgeId: true, question: true },
        },
        media: {
          columns: {
            id: true,
            type: true,
            caption: true,
            url: true,
            filePath: true,
            fileName: true,
            fileSize: true,
            mimeType: true,
          },
        },
        attachments: {
          columns: {
            id: true,
            title: true,
            type: true,
            filePath: true,
            fileName: true,
            fileSize: true,
            mimeType: true,
          },
        },
      },
    }),
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
        ne(knowledgeItems.id, id),
        isNull(knowledgeItems.deletedAt),
      ),
      columns: { id: true, question: true },
      orderBy: (t, { asc }) => asc(t.question),
      limit: 200,
    }),
  ]);

  if (!faq) notFound();

  const defaultValues: FaqFormValues = {
    question: faq.question,
    answer: faq.answer,
    categoryId: faq.categoryId,
    audience: faq.audience,
    keywords: faq.keywords,
    sourceId: faq.sourceId,
    sourceUrl: faq.sourceUrl ?? "",
    status: faq.status,
    internalNote: faq.internalNote ?? "",
    alternatives: faq.alternatives.map((a) => ({ question: a.question })),
    sources: faq.itemSources.map((s) => ({
      title: s.title,
      type: s.type,
      url: s.url ?? "",
    })),
    relatedQuestions: faq.relatedQuestions.map((r) => ({
      relatedKnowledgeId: r.relatedKnowledgeId,
      question: r.question ?? "",
    })),
    // Baris lama dibawa balik via existingId + metadata (tanpa unggah ulang).
    media: faq.media.map((m) => ({
      existingId: m.id,
      type: m.type,
      caption: m.caption ?? "",
      url: m.url ?? "",
      filePath: m.filePath,
      fileName: m.fileName,
      fileSize: m.fileSize,
      mimeType: m.mimeType,
      hasFile: false,
    })),
    attachments: faq.attachments.map((a) => ({
      existingId: a.id,
      title: a.title,
      type: a.type,
      filePath: a.filePath,
      fileName: a.fileName,
      fileSize: a.fileSize,
      mimeType: a.mimeType,
      hasFile: false,
    })),
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Edit FAQ</h1>
        <p className="text-sm text-muted-foreground">
          Perubahan akan memicu re-embedding otomatis jika teks jawaban,
          pertanyaan, kata kunci, atau audiens berubah.
        </p>
      </div>
      <FaqForm
        mode="edit"
        faqId={faq.id}
        defaultValues={defaultValues}
        categories={categories}
        sources={sources}
        relatedFaqs={relatedFaqs}
      />
    </div>
  );
}
