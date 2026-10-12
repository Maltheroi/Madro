/** Danish formatting helpers. All money values are in øre. */

const dkk = new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK" });
const int = new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("da-DK", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export const TIME_ZONE = "Europe/Copenhagen";

export function formatKr(ore: number | null | undefined): string {
  if (ore === null || ore === undefined) return "–";
  return dkk.format(ore / 100);
}

export function formatInt(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "–";
  return int.format(Math.round(n));
}

export function formatDecimal(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "–";
  return oneDecimal.format(n);
}

export function formatKcal(n: number | null | undefined): string {
  return `${formatInt(n)} kcal`;
}

export function formatGrams(n: number | null | undefined): string {
  return `${formatInt(n)} g`;
}

export function formatKg(n: number | null | undefined): string {
  return `${formatDecimal(n)} kg`;
}

export function formatDate(
  d: Date | string,
  opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" },
): string {
  const date = typeof d === "string" ? new Date(d.length === 10 ? `${d}T12:00:00Z` : d) : d;
  return new Intl.DateTimeFormat("da-DK", { timeZone: TIME_ZONE, ...opts }).format(date);
}

export function formatDateTime(d: Date | string): string {
  return formatDate(d, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function formatWeekday(d: string): string {
  return formatDate(d, { weekday: "long", day: "numeric", month: "short" });
}

/** Today's calendar date in Copenhagen as YYYY-MM-DD. */
export function todayInCopenhagen(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Monday of the week containing `date` (YYYY-MM-DD). */
export function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/** Parses Danish-style decimal input ("72,5") as well as "72.5". */
export function parseDanishNumber(s: string): number {
  return Number(s.trim().replace(/\s/g, "").replace(",", "."));
}

const upToOneDecimal = new Intl.NumberFormat("da-DK", { maximumFractionDigits: 1 });

/** Like formatDecimal, but drops a trailing ",0" (200 g, 1,5 l). */
export function formatAmount(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "–";
  return upToOneDecimal.format(n);
}
