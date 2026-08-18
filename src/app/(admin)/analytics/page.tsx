import { isNull, notInArray, sql } from "drizzle-orm";
import {
  BookOpen,
  FileQuestion,
  Handshake,
  MessageCircle,
  MessagesSquare,
  Radar,
} from "lucide-react";
import { requireUser } from "@/lib/guards";
import { db } from "@/db/client";
import {
  chatMessages,
  chatSessions,
  humanHandoffs,
  knowledgeItems,
  retrievalLogs,
  unansweredQuestions,
} from "@/db/schema";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ConfidenceDonut,
  HandoffStatusBar,
  RetrievalTrendChart,
  type ConfidenceDatum,
  type HandoffDatum,
  type TrendDatum,
} from "@/components/analytics/analytics-charts";

export const dynamic = "force-dynamic";

interface TrendRow {
  day: string;
  retrieval: number;
  unanswered: number;
}
interface ConfidenceRow {
  confidence: string;
  count: number;
}
interface HandoffRow {
  status: string;
  count: number;
}

async function getAnalytics() {
  const [kpis, trendResult, confidenceResult, handoffResult, qualityResult] =
    await Promise.all([
      Promise.all([
        db.$count(knowledgeItems, isNull(knowledgeItems.deletedAt)),
        db.$count(chatSessions),
        db.$count(chatMessages),
        db.$count(unansweredQuestions, sql`status = 'NEW'`),
        db.$count(
          humanHandoffs,
          notInArray(humanHandoffs.status, ["RESOLVED", "CLOSED"]),
        ),
        db.$count(retrievalLogs),
      ]),
      // Tren 14 hari terakhir (generate_series memastikan semua hari muncul,
      // termasuk hari tanpa aktivitas).
      db.execute(sql`
        SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
               COUNT(r.id)::int AS retrieval,
               COUNT(u.id)::int AS unanswered
        FROM generate_series(now() - interval '13 days', now(), interval '1 day') AS d(day)
        LEFT JOIN retrieval_logs r
          ON r.created_at >= d.day AND r.created_at < d.day + interval '1 day'
        LEFT JOIN unanswered_questions u
          ON u.created_at >= d.day AND u.created_at < d.day + interval '1 day'
        GROUP BY d.day
        ORDER BY d.day
      `),
      db.execute(sql`
        SELECT confidence, COUNT(*)::int AS count
        FROM retrieval_logs
        WHERE confidence IS NOT NULL
        GROUP BY confidence
      `),
      db.execute(sql`
        SELECT status, COUNT(*)::int AS count
        FROM human_handoffs
        GROUP BY status
      `),
      db.execute(sql`
        SELECT ROUND(AVG(top_score)::numeric, 4) AS avg_score
        FROM retrieval_logs
        WHERE top_score IS NOT NULL
      `),
    ]);

  const [faqCount, sessionCount, messageCount, unansweredNew, handoffOpen, retrievalCount] =
    kpis;

  const trend: TrendDatum[] = (trendResult.rows as unknown as TrendRow[]).map(
    (row) => ({
      day: row.day,
      retrieval: row.retrieval,
      unanswered: row.unanswered,
    }),
  );

  const confidenceData: ConfidenceDatum[] = (
    confidenceResult.rows as unknown as ConfidenceRow[]
  ).map((row) => ({
    confidence: row.confidence,
    count: row.count,
  }));

  const handoffData: HandoffDatum[] = (
    handoffResult.rows as unknown as HandoffRow[]
  ).map((row) => ({
    status: row.status,
    count: row.count,
  }));

  const avgScore =
    Number(
      (qualityResult.rows as Array<{ avg_score: string | number | null }>)[0]
        ?.avg_score ?? 0,
    ) || 0;

  const confidenceTotal = confidenceData.reduce((sum, d) => sum + d.count, 0);
  const confidenceRate = (key: string) =>
    confidenceTotal > 0
      ? ((confidenceData.find((d) => d.confidence === key)?.count ?? 0) /
          confidenceTotal) *
        100
      : 0;

  return {
    kpis: {
      faqCount,
      sessionCount,
      messageCount,
      unansweredNew,
      handoffOpen,
      retrievalCount,
    },
    trend,
    confidenceData,
    handoffData,
    quality: {
      avgScore,
      highRate: confidenceRate("HIGH"),
      mediumRate: confidenceRate("MEDIUM"),
      lowRate: confidenceRate("LOW"),
      lowCount: confidenceData.find((d) => d.confidence === "LOW")?.count ?? 0,
    },
  };
}

export default async function AnalyticsPage() {
  await requireUser();
  const data = await getAnalytics();
  const { kpis, quality } = data;

  const kpiCards = [
    {
      title: "FAQ Aktif",
      value: kpis.faqCount,
      desc: "Entri knowledge base",
      icon: BookOpen,
    },
    {
      title: "Sesi Percakapan",
      value: kpis.sessionCount,
      desc: "Chat WhatsApp tercatat",
      icon: MessageCircle,
    },
    {
      title: "Pesan",
      value: kpis.messageCount,
      desc: "Total pesan disimpan",
      icon: MessagesSquare,
    },
    {
      title: "Retrieval",
      value: kpis.retrievalCount,
      desc: "Pencarian semantic",
      icon: Radar,
    },
    {
      title: "Tak Terjawab",
      value: kpis.unansweredNew,
      desc: "Menunggu review",
      icon: FileQuestion,
    },
    {
      title: "Handoff Terbuka",
      value: kpis.handoffOpen,
      desc: "Belum selesai",
      icon: Handshake,
    },
  ];

  const qualityStats = [
    {
      label: "Skor rata-rata",
      value: `${(quality.avgScore * 100).toFixed(1)}%`,
      hint: "top score rata-rata retrieval",
    },
    {
      label: "Keyakinan tinggi",
      value: `${quality.highRate.toFixed(1)}%`,
      hint: "jawab langsung tanpa manusia",
    },
    {
      label: "Keyakinan sedang",
      value: `${quality.mediumRate.toFixed(1)}%`,
      hint: "perlu verifikasi petugas",
    },
    {
      label: "Keyakinan rendah",
      value: `${quality.lowRate.toFixed(1)}%`,
      hint: `${quality.lowCount} pertanyaan dialihkan ke manusia`,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Analitik</h1>
        <p className="text-sm text-muted-foreground">
          KPI dan tren dari data database nyata — retrieval, kualitas jawaban,
          dan handoff bot WhatsApp.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpiCards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {card.title}
              </CardTitle>
              <card.icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
              <CardDescription>{card.desc}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            Aktivitas Retrieval &amp; Pertanyaan Tak Terjawab
          </CardTitle>
          <CardDescription>14 hari terakhir</CardDescription>
        </CardHeader>
        <CardContent>
          <RetrievalTrendChart data={data.trend} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Distribusi Keyakinan</CardTitle>
            <CardDescription>Confidence hasil retrieval</CardDescription>
          </CardHeader>
          <CardContent>
            <ConfidenceDonut data={data.confidenceData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Status Handoff</CardTitle>
            <CardDescription>Distribusi permintaan manusia</CardDescription>
          </CardHeader>
          <CardContent>
            <HandoffStatusBar data={data.handoffData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Kualitas Retrieval</CardTitle>
            <CardDescription>Ringkasan anti-halusinasi</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {qualityStats.map((stat) => (
              <div key={stat.label} className="space-y-0.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm text-muted-foreground">
                    {stat.label}
                  </span>
                  <span className="text-lg font-semibold tabular-nums">
                    {stat.value}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{stat.hint}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
