import { BookOpen, FileQuestion, MessagesSquare, Users } from "lucide-react";
import { requireUser } from "@/lib/guards";
import { db } from "@/db/client";
import { knowledgeItems, unansweredQuestions, chatMessages, users } from "@/db/schema";
import { isNull, sql } from "drizzle-orm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

async function getDashboardStats() {
  const [faqCount, unansweredCount, messageCount, userCount] = await Promise.all([
    db.$count(knowledgeItems, isNull(knowledgeItems.deletedAt)),
    db.$count(unansweredQuestions, sql`1 = 1`),
    db.$count(chatMessages, sql`1 = 1`),
    db.$count(users, sql`1 = 1`),
  ]);

  return { faqCount, unansweredCount, messageCount, userCount };
}

export default async function DashboardPage() {
  const user = await requireUser();
  const stats = await getDashboardStats();

  const cards = [
    {
      title: "FAQ Aktif",
      value: stats.faqCount,
      desc: "Entri di knowledge base",
      icon: BookOpen,
    },
    {
      title: "Tak Terjawab",
      value: stats.unansweredCount,
      desc: "Pertanyaan butuh review",
      icon: FileQuestion,
    },
    {
      title: "Percakapan",
      value: stats.messageCount,
      desc: "Pesan tercatat",
      icon: MessagesSquare,
    },
    {
      title: "Pengguna",
      value: stats.userCount,
      desc: "Akun terdaftar",
      icon: Users,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Selamat datang, {user.name.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted-foreground">
          Ringkasan sistem BAAK AI — knowledge base, percakapan, dan kualitas
          jawaban bot.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {card.title}
              </CardTitle>
              <div className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                <card.icon className="size-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tracking-tight tabular-nums">
                {card.value}
              </div>
              <CardDescription>{card.desc}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Panduan Cepat</CardTitle>
          <CardDescription>
            Alur kerja harian petugas BAAK.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Periksa daftar <b>Tak Terjawab</b> untuk pertanyaan baru.</li>
            <li>Tambahkan jawaban ke <b>Knowledge Base</b> bila valid.</li>
            <li>Pantau percakapan & handoff yang memerlukan tindakan.</li>
          </ol>
          <p className="text-sm text-muted-foreground md:col-span-2">
            FAQ yang diaktifkan akan otomatis di-embedding dan dipakai sebagai
            sumber jawaban bot WhatsApp. Pastikan status <b>AKTIF</b> hanya
            untuk konten yang sudah diverifikasi.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
