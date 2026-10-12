/**
 * Smoothed weight trend.
 *
 * Daily weight is the mean of that day's weigh-ins. The trend is an
 * exponentially weighted moving average with α = 0.1 per day; across gaps the
 * smoothing factor compounds (α_eff = 1 − (1 − α)^gapDays) so a missing week
 * does not freeze the trend. A single weigh-in moves the trend by at most 10 %
 * of its deviation, which keeps water fluctuations from looking like progress.
 */

export const TREND_ALPHA = 0.1;

export interface WeighIn {
  /** ISO timestamp of the measurement. */
  measuredAt: string;
  weightKg: number;
}

export interface DailyWeight {
  date: string;
  weightKg: number;
  count: number;
}

export interface TrendPoint {
  date: string;
  weightKg: number | null;
  trendKg: number;
}

/** Calendar date in a time zone (default Europe/Copenhagen). */
export function localDate(iso: string, timeZone = "Europe/Copenhagen"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(iso),
  );
}

export function dailyWeights(weighIns: WeighIn[], timeZone?: string): DailyWeight[] {
  const map = new Map<string, { sum: number; count: number }>();
  for (const w of weighIns) {
    const d = localDate(w.measuredAt, timeZone);
    const cur = map.get(d) ?? { sum: 0, count: 0 };
    cur.sum += w.weightKg;
    cur.count += 1;
    map.set(d, cur);
  }
  return [...map.entries()]
    .map(([date, { sum, count }]) => ({ date, weightKg: sum / count, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function smoothTrend(days: DailyWeight[], alpha = TREND_ALPHA): TrendPoint[] {
  const out: TrendPoint[] = [];
  let trend: number | null = null;
  let prev: string | null = null;
  for (const d of days) {
    if (trend === null || prev === null) {
      trend = d.weightKg;
    } else {
      const gap = Math.max(1, daysBetween(prev, d.date));
      const a = 1 - (1 - alpha) ** gap;
      trend = trend + a * (d.weightKg - trend);
    }
    out.push({ date: d.date, weightKg: d.weightKg, trendKg: trend });
    prev = d.date;
  }
  return out;
}

export interface Regression {
  slopePerDay: number;
  /** Standard error of the slope, or null with fewer than 3 points. */
  slopeStdError: number | null;
  n: number;
}

/** Ordinary least squares of value on day index. */
export function linearRegression(points: { date: string; value: number }[]): Regression | null {
  if (points.length < 2) return null;
  const x0 = points[0].date;
  const xs = points.map((p) => daysBetween(x0, p.date));
  const ys = points.map((p) => p.value);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  let se: number | null = null;
  if (n > 2) {
    const intercept = my - slope * mx;
    const sse = xs.reduce((acc, x, i) => acc + (ys[i] - (intercept + slope * x)) ** 2, 0);
    se = Math.sqrt(sse / (n - 2) / sxx);
  }
  return { slopePerDay: slope, slopeStdError: se, n };
}
