/**
 * Daily totals, weekly averages and target differences for logged intake.
 * Dates are ISO calendar dates (YYYY-MM-DD) in the user's local time zone.
 */

import type { MacroTargets } from "./energy";

export interface IntakeEntry {
  date: string;
  energyKcal: number;
  proteinG: number;
  carbohydrateG: number;
  fatG: number;
}

export interface DailyIntake {
  date: string;
  energyKcal: number;
  proteinG: number;
  carbohydrateG: number;
  fatG: number;
  entryCount: number;
}

export interface Targets extends MacroTargets {
  energyKcal: number;
}

export function dailyTotals(entries: IntakeEntry[]): DailyIntake[] {
  const byDate = new Map<string, DailyIntake>();
  for (const e of entries) {
    const day = byDate.get(e.date) ?? {
      date: e.date,
      energyKcal: 0,
      proteinG: 0,
      carbohydrateG: 0,
      fatG: 0,
      entryCount: 0,
    };
    day.energyKcal += e.energyKcal;
    day.proteinG += e.proteinG;
    day.carbohydrateG += e.carbohydrateG;
    day.fatG += e.fatG;
    day.entryCount += 1;
    byDate.set(e.date, day);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export interface WeeklyAverage {
  /** Days with at least one entry. Days without logs are excluded, not counted as zero. */
  loggedDays: number;
  energyKcal: number | null;
  proteinG: number | null;
  carbohydrateG: number | null;
  fatG: number | null;
}

export function averageOfLoggedDays(days: DailyIntake[]): WeeklyAverage {
  const logged = days.filter((d) => d.entryCount > 0);
  if (logged.length === 0) {
    return { loggedDays: 0, energyKcal: null, proteinG: null, carbohydrateG: null, fatG: null };
  }
  const sum = (k: keyof Omit<DailyIntake, "date" | "entryCount">) =>
    logged.reduce((acc, d) => acc + d[k], 0) / logged.length;
  return {
    loggedDays: logged.length,
    energyKcal: sum("energyKcal"),
    proteinG: sum("proteinG"),
    carbohydrateG: sum("carbohydrateG"),
    fatG: sum("fatG"),
  };
}

export interface TargetDifference {
  key: keyof Targets;
  target: number;
  actual: number;
  /** actual − target */
  difference: number;
  /** actual / target, or null when the target is 0. */
  ratio: number | null;
}

export function compareToTargets(
  actual: Omit<DailyIntake, "date" | "entryCount">,
  targets: Targets,
): TargetDifference[] {
  return (["energyKcal", "proteinG", "carbohydrateG", "fatG"] as const).map((key) => ({
    key,
    target: targets[key],
    actual: actual[key],
    difference: actual[key] - targets[key],
    ratio: targets[key] > 0 ? actual[key] / targets[key] : null,
  }));
}

/** Calendar dates from `start` to `end` inclusive. */
export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (d <= last) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
