"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface ChartPoint {
  date: string;
  weightKg: number | null;
  trendKg: number;
}

const fmtDate = (d: string) =>
  new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${d}T00:00:00Z`),
  );
const fmtKg = (n: number) =>
  `${n.toLocaleString("da-DK", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`;

export function WeightChart({ points, goalKg }: { points: ChartPoint[]; goalKg: number | null }) {
  const values = points
    .flatMap((p) => [p.weightKg ?? p.trendKg, p.trendKg])
    .concat(goalKg ? [goalKg] : []);
  const min = Math.floor(Math.min(...values) - 1);
  const max = Math.ceil(Math.max(...values) + 1);
  return (
    <div
      className="h-64 w-full"
      role="img"
      aria-label={`Vægtkurve med ${points.length} målinger. Seneste trend ${fmtKg(points.at(-1)!.trendKg)}.`}
    >
      <ResponsiveContainer>
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickFormatter={fmtDate}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            minTickGap={24}
          />
          <YAxis
            domain={[min, max]}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            tickFormatter={(n: number) => n.toLocaleString("da-DK")}
          />
          <Tooltip
            labelFormatter={(d) => fmtDate(String(d))}
            formatter={(v, name) => [
              typeof v === "number" ? fmtKg(v) : "–",
              name === "trendKg" ? "Trend" : "Vægt",
            ]}
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 8,
            }}
          />
          {goalKg ? (
            <ReferenceLine
              y={goalKg}
              stroke="var(--success-foreground)"
              strokeDasharray="4 4"
              label={{
                value: "Mål",
                position: "insideTopRight",
                fontSize: 12,
                fill: "var(--muted-foreground)",
              }}
            />
          ) : null}
          <Legend formatter={(v) => (v === "trendKg" ? "Trend (udjævnet)" : "Daglig vægt")} />
          <Line
            type="monotone"
            dataKey="weightKg"
            stroke="var(--muted-foreground)"
            strokeWidth={0}
            dot={{ r: 3, fill: "var(--muted-foreground)", strokeWidth: 0 }}
            isAnimationActive={false}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="trendKg"
            stroke="var(--primary)"
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
