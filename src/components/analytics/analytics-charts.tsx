"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { HANDOFF_STATUS_LABEL } from "@/components/knowledge/badges";

export interface TrendDatum {
  day: string;
  retrieval: number;
  unanswered: number;
}

export interface ConfidenceDatum {
  confidence: string;
  count: number;
}

export interface HandoffDatum {
  status: string;
  count: number;
}

const CONFIDENCE_META: Record<string, { label: string; color: string }> = {
  HIGH: { label: "Tinggi", color: "#10b981" },
  MEDIUM: { label: "Sedang", color: "#f59e0b" },
  LOW: { label: "Rendah", color: "#ef4444" },
};

const AXIS_TICK = { fontSize: 12, fill: "var(--muted-foreground)" };
const GRID_STROKE = "var(--border)";

interface ChartTooltipEntry {
  dataKey?: string | number;
  name?: string;
  value?: number | string;
  color?: string;
  fill?: string;
}

interface ChartTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: ChartTooltipEntry[];
}

/** Tooltip recharts seragam, mengikuti tema UI. */
function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border bg-card px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 font-medium">{String(label)}</p>
      {payload.map((entry) => (
        <div key={String(entry.dataKey)} className="flex items-center gap-2">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ background: entry.color ?? entry.fill }}
          />
          <span className="text-muted-foreground">{entry.name}</span>
          <span className="ml-auto font-semibold tabular-nums">
            {String(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Tren retrieval & pertanyaan tak terjawab per hari (14 hari terakhir). */
export function RetrievalTrendChart({ data }: { data: TrendDatum[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="grad-retrieval" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.25} />
              <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="grad-unanswered" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="day"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: string) => v.slice(5)}
          />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip content={<ChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area
            type="monotone"
            name="Retrieval"
            dataKey="retrieval"
            stroke="var(--primary)"
            strokeWidth={2}
            fill="url(#grad-retrieval)"
          />
          <Area
            type="monotone"
            name="Tak terjawab"
            dataKey="unanswered"
            stroke="#f59e0b"
            strokeWidth={2}
            fill="url(#grad-unanswered)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Distribusi level keyakinan retrieval (donut). */
export function ConfidenceDonut({ data }: { data: ConfidenceDatum[] }) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  return (
    <div>
      <div className="h-60 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="confidence"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={2}
              strokeWidth={0}
            >
              {data.map((d) => (
                <Cell
                  key={d.confidence}
                  fill={CONFIDENCE_META[d.confidence]?.color ?? "var(--muted-foreground)"}
                />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 12 }}
              formatter={(value: string) => CONFIDENCE_META[value]?.label ?? value}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        {total} retrieval tercatat dengan confidence.
      </p>
    </div>
  );
}

/** Distribusi status handoff (bar). */
export function HandoffStatusBar({ data }: { data: HandoffDatum[] }) {
  return (
    <div className="h-60 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="status"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: string) => HANDOFF_STATUS_LABEL[v] ?? v}
          />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip content={<ChartTooltip />} />
          <Bar dataKey="count" name="Handoff" fill="var(--foreground)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
