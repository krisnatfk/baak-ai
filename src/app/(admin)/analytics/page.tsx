import Link from "next/link";
import { isNull, sql } from "drizzle-orm";
import { BarChart3, BookOpen, FileQuestion, Radar } from "lucide-react";
import { db } from "@/db/client";
import { knowledgeItems, retrievalLogs, unansweredQuestions } from "@/db/schema";
import { requireUser } from "@/lib/guards";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfidenceDonut, RetrievalTrendChart, type ConfidenceDatum, type TrendDatum } from "@/components/analytics/analytics-charts";

export const dynamic = "force-dynamic";

interface RankedRow { label: string; count: number }
interface ConfidenceRow { confidence: string; count: number }
interface TrendRow { day: string; retrieval: number; unanswered: number }

async function getAnalytics(periodDays: number) {
  const [faqCount, retrievalCount, unansweredCount, trend, confidence, average, topQuestions, topFaq, unanswered, low, menu] = await Promise.all([
    db.$count(knowledgeItems, isNull(knowledgeItems.deletedAt)),
    db.$count(retrievalLogs, sql`${retrievalLogs.createdAt} >= now() - (${periodDays} * interval '1 day')`),
    db.$count(unansweredQuestions, sql`${unansweredQuestions.createdAt} >= now() - (${periodDays} * interval '1 day')`),
    db.execute(sql`SELECT to_char(d.day, 'YYYY-MM-DD') AS day, (SELECT COUNT(*)::int FROM retrieval_logs r WHERE r.created_at >= d.day AND r.created_at < d.day + interval '1 day') AS retrieval, (SELECT COUNT(*)::int FROM unanswered_questions u WHERE u.created_at >= d.day AND u.created_at < d.day + interval '1 day') AS unanswered FROM generate_series(now() - (${periodDays - 1} * interval '1 day'), now(), interval '1 day') AS d(day) ORDER BY d.day`),
    db.execute(sql`SELECT confidence, COUNT(*)::int AS count FROM retrieval_logs WHERE confidence IS NOT NULL AND created_at >= now() - (${periodDays} * interval '1 day') GROUP BY confidence`),
    db.execute(sql`SELECT ROUND(AVG(top_score)::numeric, 4) AS avg_score FROM retrieval_logs WHERE top_score IS NOT NULL AND created_at >= now() - (${periodDays} * interval '1 day')`),
    db.execute(sql`SELECT normalized_question AS label, COUNT(*)::int AS count FROM bot_analytics_events WHERE type = 'QUESTION' AND normalized_question IS NOT NULL AND created_at >= now() - (${periodDays} * interval '1 day') GROUP BY normalized_question ORDER BY count DESC, label LIMIT 10`),
    db.execute(sql`SELECT k.question AS label, COUNT(*)::int AS count FROM bot_analytics_events e JOIN knowledge_items k ON k.id = e.matched_faq_id WHERE e.type = 'FAQ_MATCH' AND e.created_at >= now() - (${periodDays} * interval '1 day') GROUP BY k.id, k.question ORDER BY count DESC, label LIMIT 10`),
    db.execute(sql`SELECT normalized_question AS label, times_asked::int AS count FROM unanswered_questions WHERE created_at >= now() - (${periodDays} * interval '1 day') ORDER BY times_asked DESC, created_at DESC LIMIT 10`),
    db.execute(sql`SELECT query AS label, 1::int AS count FROM retrieval_logs WHERE confidence = 'LOW' AND created_at >= now() - (${periodDays} * interval '1 day') ORDER BY created_at DESC LIMIT 10`),
    db.execute(sql`SELECT COALESCE(metadata->>'number', '?') || '. ' || COALESCE(normalized_question, 'menu') AS label, COUNT(*)::int AS count FROM bot_analytics_events WHERE type = 'MENU_SELECTION' AND created_at >= now() - (${periodDays} * interval '1 day') GROUP BY metadata->>'number', normalized_question ORDER BY count DESC, label LIMIT 10`),
  ]);
  const confidenceData = confidence.rows as unknown as ConfidenceRow[];
  const totalConfidence = confidenceData.reduce((sum, row) => sum + row.count, 0);
  const count = (key: string) => confidenceData.find((row) => row.confidence === key)?.count ?? 0;
  return {
    faqCount,
    retrievalCount,
    unansweredCount,
    trend: trend.rows as unknown as TrendRow[],
    confidence: confidenceData,
    average: Number((average.rows[0] as { avg_score?: string | null })?.avg_score ?? 0),
    highRate: totalConfidence ? (count("HIGH") / totalConfidence) * 100 : 0,
    lowCount: count("LOW"),
    rankings: {
      topQuestions: topQuestions.rows as unknown as RankedRow[],
      topFaq: topFaq.rows as unknown as RankedRow[],
      unanswered: unanswered.rows as unknown as RankedRow[],
      low: low.rows as unknown as RankedRow[],
      menu: menu.rows as unknown as RankedRow[],
    },
  };
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  await requireUser();
  const requested = Number((await searchParams).period);
  const periodDays = [7, 30, 90].includes(requested) ? requested : 30;
  const data = await getAnalytics(periodDays);
  const cards = [
    { title: "FAQ", value: data.faqCount, icon: BookOpen },
    { title: "Retrieval", value: data.retrievalCount, icon: Radar },
    { title: "Tak Terjawab", value: data.unansweredCount, icon: FileQuestion },
    { title: "Skor Rata-rata", value: `${(data.average * 100).toFixed(1)}%`, icon: BarChart3 },
    { title: "Confidence HIGH", value: `${data.highRate.toFixed(1)}%`, icon: BarChart3 },
    { title: "Confidence LOW", value: data.lowCount, icon: BarChart3 },
  ];
  const trendData: TrendDatum[] = data.trend;
  const confidenceData: ConfidenceDatum[] = data.confidence;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-xl font-semibold tracking-tight">Analitik</h1><p className="text-sm text-muted-foreground">Pertanyaan, FAQ match, confidence, menu, dan unanswered dari database.</p></div>
        <div className="flex gap-2">{[7, 30, 90].map((period) => <Button key={period} variant={periodDays === period ? "default" : "outline"} size="sm" asChild><Link href={`/analytics?period=${period}`}>{period} hari</Link></Button>)}</div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{cards.map((card) => <Card key={card.title}><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">{card.title}</CardTitle><card.icon className="size-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{card.value}</div><CardDescription>{periodDays} hari</CardDescription></CardContent></Card>)}</div>
      <Card><CardHeader><CardTitle className="text-sm">Aktivitas Retrieval & Tak Terjawab</CardTitle><CardDescription>{periodDays} hari terakhir</CardDescription></CardHeader><CardContent><RetrievalTrendChart data={trendData} /></CardContent></Card>
      <div className="grid gap-4 lg:grid-cols-3"><Card><CardHeader><CardTitle className="text-sm">Distribusi Confidence</CardTitle></CardHeader><CardContent><ConfidenceDonut data={confidenceData} /></CardContent></Card><RankingCard title="Pertanyaan paling sering" rows={data.rankings.topQuestions} /><RankingCard title="FAQ paling sering matched" rows={data.rankings.topFaq} /></div>
      <div className="grid gap-4 md:grid-cols-3"><RankingCard title="Pertanyaan tidak terjawab" rows={data.rankings.unanswered} /><RankingCard title="Low confidence terbaru" rows={data.rankings.low} /><RankingCard title="Menu paling sering dipilih" rows={data.rankings.menu} /></div>
    </div>
  );
}

function RankingCard({ title, rows }: { title: string; rows: RankedRow[] }) {
  return <Card><CardHeader><CardTitle className="text-sm">{title}</CardTitle></CardHeader><CardContent>{rows.length === 0 ? <p className="text-sm text-muted-foreground">Belum ada data pada periode ini.</p> : <ol className="space-y-2">{rows.map((row, index) => <li key={`${row.label}-${index}`} className="flex items-start justify-between gap-3 text-sm"><span className="line-clamp-2">{index + 1}. {row.label}</span><span className="font-semibold tabular-nums">{row.count}</span></li>)}</ol>}</CardContent></Card>;
}

