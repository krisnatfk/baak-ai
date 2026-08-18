import { KnowledgeNav } from "@/components/knowledge/knowledge-nav";

export default function KnowledgeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <KnowledgeNav />
      {children}
    </div>
  );
}
