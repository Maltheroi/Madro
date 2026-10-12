/**
 * Adaptive calorie recommendation, algorithm "adaptive-energy" v1.
 * Full description: docs/ARCHITECTURE.md#adaptive-calorie-algorithm.
 *
 * Energy balance: intake − expenditure ≈ change in stored energy. Over a
 * window of at least 14 days with sufficient weigh-ins and complete food logs,
 *     observed TDEE = mean logged intake − weight slope (kg/day) × 7 700 kcal/kg
 * where the slope is a least-squares fit to the daily weights in the window.
 * The observation is blended with the previous TDEE estimate in proportion to
 * how much data supports it, checked for plausibility, and turned into a new
 * target. Changes are capped per adjustment. When the evidence is weak, the
 * current target is kept and the reason is stated.
 *
 * Weight change includes water, glycogen and gut content. The result is an
 * inferred estimate, not a measurement of metabolism.
 */

import {
  GUARDRAILS,
  KCAL_PER_KG_BODY_MASS,
  RATE_LIMITS,
  type Goal,
} from "@/features/nutrition/domain/energy";
import { roundTargetKcal } from "@/features/nutrition/domain/rounding";
import { dailyWeights, linearRegression, smoothTrend, type WeighIn } from "./trend";

export const ADAPTIVE_ALGORITHM = { key: "adaptive-energy", version: "1.0.0" } as const;

export const ADAPTIVE_RULES = {
  windowDays: 21,
  minSpanDays: 14,
  minWeighInDays: 8,
  minCompleteLogShare: 0.8,
  /** A day counts as completely logged if marked complete, or if it has ≥ 2 entries and ≥ 50 % of target energy. */
  autoCompleteMinEntries: 2,
  autoCompleteMinShare: 0.5,
  /** Full weight is given to observed TDEE after this many complete days. */
  fullConfidenceDays: 28,
  maxChangePerAdjustmentKcal: 150,
  minMeaningfulChangeKcal: 50,
  minDaysBetweenRecommendations: 7,
  plausibleTdeeRange: [0.6, 1.5] as const,
} as const;

export interface IntakeDay {
  date: string;
  energyKcal: number;
  entryCount: number;
  markedComplete: boolean;
}

export interface AdaptiveInput {
  today: string;
  weighIns: WeighIn[];
  intake: IntakeDay[];
  currentTargetKcal: number;
  /** Most recent expenditure estimate (initial or previously inferred). */
  priorTdeeKcal: number;
  bmrKcal: number;
  goal: Goal;
  weeklyRatePercent: number | null;
  currentWeightKg: number;
  goalWeightKg: number | null;
  lastRecommendationDate: string | null;
  timeZone?: string;
}

export type KeepReason =
  | "too_soon"
  | "insufficient_span"
  | "insufficient_weigh_ins"
  | "incomplete_food_logs"
  | "implausible_estimate"
  | "change_too_small";

export interface DataQuality {
  windowStart: string;
  windowEnd: string;
  weighInDays: number;
  spanDays: number;
  completeLogDays: number;
  windowDays: number;
  completeLogShare: number;
}

export interface AdaptiveRecommendation {
  algorithm: typeof ADAPTIVE_ALGORITHM;
  decision: "adjust" | "keep";
  keepReasons: KeepReason[];
  previousTargetKcal: number;
  recommendedTargetKcal: number;
  observedTdeeKcal: number | null;
  blendedTdeeKcal: number | null;
  trendKgPerWeek: number | null;
  averageIntakeKcal: number | null;
  quality: DataQuality;
  explanation: string[];
  timeline: GoalTimeline | null;
}

export interface GoalTimeline {
  weeksLow: number;
  weeksHigh: number;
  basis: "observed_trend" | "planned_rate";
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function isCompleteLogDay(day: IntakeDay, targetKcal: number): boolean {
  if (day.markedComplete) return true;
  return (
    day.entryCount >= ADAPTIVE_RULES.autoCompleteMinEntries &&
    day.energyKcal >= ADAPTIVE_RULES.autoCompleteMinShare * targetKcal
  );
}

export function goalDeltaKcal(goal: Goal, weeklyRatePercent: number | null, weightKg: number, tdee: number): number {
  if (goal === "maintenance") return 0;
  if (goal === "recomposition") return -tdee * GUARDRAILS.recompositionDeficitFraction;
  const limits = RATE_LIMITS[goal];
  const rate = Math.min(limits.max, Math.max(limits.min, weeklyRatePercent ?? limits.default));
  const daily = ((rate / 100) * weightKg * KCAL_PER_KG_BODY_MASS) / 7;
  const capped = goal === "fat_loss" ? Math.min(daily, tdee * GUARDRAILS.maxDeficitFraction) : Math.min(daily, tdee * GUARDRAILS.maxSurplusFraction);
  return goal === "fat_loss" ? -capped : capped;
}

/** Estimated weeks to goal as a range. Returns null when not moving toward the goal. */
export function goalTimeline(
  currentKg: number,
  goalKg: number | null,
  kgPerWeek: number | null,
  slopeSeKgPerWeek: number | null,
  plannedKgPerWeek: number,
): GoalTimeline | null {
  if (goalKg === null) return null;
  const remaining = goalKg - currentKg;
  if (Math.abs(remaining) < 0.3) return null;
  const sign = Math.sign(remaining);
  let low: number;
  let high: number;
  let basis: GoalTimeline["basis"];
  if (kgPerWeek !== null && slopeSeKgPerWeek !== null && Math.sign(kgPerWeek) === sign) {
    const fast = Math.abs(kgPerWeek) + 1.96 * slopeSeKgPerWeek;
    const slow = Math.max(Math.abs(kgPerWeek) - 1.96 * slopeSeKgPerWeek, Math.abs(kgPerWeek) * 0.5);
    low = Math.abs(remaining) / fast;
    high = Math.abs(remaining) / slow;
    basis = "observed_trend";
  } else if (plannedKgPerWeek !== 0 && Math.sign(plannedKgPerWeek) === sign) {
    // Planned rate with ±30 % uncertainty.
    low = Math.abs(remaining) / (Math.abs(plannedKgPerWeek) * 1.3);
    high = Math.abs(remaining) / (Math.abs(plannedKgPerWeek) * 0.7);
    basis = "planned_rate";
  } else {
    return null;
  }
  return { weeksLow: Math.max(1, Math.floor(low)), weeksHigh: Math.ceil(high), basis };
}

export function recommendCalories(input: AdaptiveInput): AdaptiveRecommendation {
  const R = ADAPTIVE_RULES;
  const windowEnd = input.today;
  const windowStart = addDays(windowEnd, -(R.windowDays - 1));
  const explanation: string[] = [];
  const keepReasons: KeepReason[] = [];

  const allDays = dailyWeights(input.weighIns, input.timeZone);
  const trend = smoothTrend(allDays);
  const windowTrend = trend.filter((p) => p.date >= windowStart && p.date <= windowEnd);
  const weighInDays = windowTrend.length;
  const spanDays = weighInDays > 1 ? daysBetween(windowTrend[0].date, windowTrend[weighInDays - 1].date) : 0;

  const intakeWindow = input.intake.filter((d) => d.date >= windowStart && d.date <= windowEnd);
  const completeDays = intakeWindow.filter((d) => isCompleteLogDay(d, input.currentTargetKcal));
  // Measure log completeness over the span covered by weigh-ins, not before the user started.
  const firstDataDate = [windowTrend[0]?.date, intakeWindow[0]?.date].filter(Boolean).sort()[0] ?? windowEnd;
  const coveredDays = daysBetween(firstDataDate < windowStart ? windowStart : firstDataDate, windowEnd) + 1;
  const completeShare = coveredDays > 0 ? completeDays.length / coveredDays : 0;

  const quality: DataQuality = {
    windowStart,
    windowEnd,
    weighInDays,
    spanDays,
    completeLogDays: completeDays.length,
    windowDays: coveredDays,
    completeLogShare: completeShare,
  };

  // The slope comes from least squares on the raw daily weights in the window.
  // Regressing the EWMA instead would inherit its start-up lag and understate
  // the rate of change; the regression itself averages out daily noise.
  const regression = linearRegression(
    windowTrend.map((p) => ({ date: p.date, value: p.weightKg ?? p.trendKg })),
  );
  const kgPerWeek = regression ? regression.slopePerDay * 7 : null;
  const seKgPerWeek = regression?.slopeStdError != null ? regression.slopeStdError * 7 : null;
  const plannedDelta = goalDeltaKcal(input.goal, input.weeklyRatePercent, input.currentWeightKg, input.priorTdeeKcal);
  const plannedKgPerWeek = (plannedDelta * 7) / KCAL_PER_KG_BODY_MASS;
  const timeline = goalTimeline(input.currentWeightKg, input.goalWeightKg, kgPerWeek, seKgPerWeek, plannedKgPerWeek);

  const keep = (extra?: Partial<AdaptiveRecommendation>): AdaptiveRecommendation => ({
    algorithm: ADAPTIVE_ALGORITHM,
    decision: "keep",
    keepReasons,
    previousTargetKcal: input.currentTargetKcal,
    recommendedTargetKcal: input.currentTargetKcal,
    observedTdeeKcal: null,
    blendedTdeeKcal: null,
    trendKgPerWeek: kgPerWeek,
    averageIntakeKcal: null,
    quality,
    explanation,
    timeline,
    ...extra,
  });

  if (input.lastRecommendationDate && daysBetween(input.lastRecommendationDate, input.today) < R.minDaysBetweenRecommendations) {
    keepReasons.push("too_soon");
    explanation.push(`Sidste vurdering var for under ${R.minDaysBetweenRecommendations} dage siden. Vi venter, så ændringer kan nå at vise sig.`);
  }
  if (spanDays < R.minSpanDays) {
    keepReasons.push("insufficient_span");
    explanation.push(`Vi har brug for vejninger over mindst ${R.minSpanDays} dage. Du har ${spanDays} dage.`);
  }
  if (weighInDays < R.minWeighInDays) {
    keepReasons.push("insufficient_weigh_ins");
    explanation.push(`Vi har brug for mindst ${R.minWeighInDays} dage med vejning i de seneste ${R.windowDays} dage. Du har ${weighInDays}.`);
  }
  if (completeShare < R.minCompleteLogShare) {
    keepReasons.push("incomplete_food_logs");
    explanation.push(
      `Kun ${Math.round(completeShare * 100)} % af dagene har en komplet madregistrering. Vi kræver mindst ${Math.round(R.minCompleteLogShare * 100)} %, før vi justerer.`,
    );
  }
  if (keepReasons.length > 0 || !regression) {
    explanation.push("Dit nuværende mål beholdes.");
    return keep();
  }

  const avgIntake = completeDays.reduce((a, d) => a + d.energyKcal, 0) / completeDays.length;
  const observedTdee = avgIntake - regression.slopePerDay * KCAL_PER_KG_BODY_MASS;
  const [lo, hi] = R.plausibleTdeeRange;
  if (observedTdee < input.priorTdeeKcal * lo || observedTdee > input.priorTdeeKcal * hi) {
    keepReasons.push("implausible_estimate");
    explanation.push(
      `Det beregnede forbrug (${Math.round(observedTdee)} kcal) afviger usandsynligt meget fra det tidligere estimat. Det skyldes oftest ufuldstændig registrering eller væskeudsving. Målet beholdes.`,
    );
    return keep({ observedTdeeKcal: Math.round(observedTdee), averageIntakeKcal: Math.round(avgIntake) });
  }

  const weight = Math.min(1, completeDays.length / R.fullConfidenceDays);
  const blended = input.priorTdeeKcal + weight * (observedTdee - input.priorTdeeKcal);
  const delta = goalDeltaKcal(input.goal, input.weeklyRatePercent, input.currentWeightKg, blended);
  let proposed = blended + delta;
  const floor = Math.max(GUARDRAILS.absoluteFloorKcal, input.bmrKcal);
  if (proposed < floor && input.goal !== "muscle_gain") proposed = Math.min(floor, blended);
  const rawChange = proposed - input.currentTargetKcal;
  const change = Math.max(-R.maxChangePerAdjustmentKcal, Math.min(R.maxChangePerAdjustmentKcal, rawChange));
  const recommended = roundTargetKcal(input.currentTargetKcal + change);

  explanation.push(
    `Gennemsnitligt indtag på komplette dage: ${Math.round(avgIntake)} kcal. Vægttrend: ${(regression.slopePerDay * 7).toFixed(2).replace(".", ",")} kg pr. uge.`,
  );
  explanation.push(
    `Det giver et estimeret forbrug på ${Math.round(observedTdee)} kcal, vægtet ${Math.round(weight * 100)} % mod det tidligere estimat på ${Math.round(input.priorTdeeKcal)} kcal: ${Math.round(blended)} kcal.`,
  );

  if (Math.abs(recommended - input.currentTargetKcal) < R.minMeaningfulChangeKcal) {
    keepReasons.push("change_too_small");
    explanation.push("Forskellen til dit nuværende mål er for lille til at være meningsfuld. Målet beholdes.");
    return keep({
      observedTdeeKcal: Math.round(observedTdee),
      blendedTdeeKcal: Math.round(blended),
      averageIntakeKcal: Math.round(avgIntake),
    });
  }
  if (Math.abs(rawChange) > R.maxChangePerAdjustmentKcal) {
    explanation.push(`Ændringen er begrænset til ${R.maxChangePerAdjustmentKcal} kcal ad gangen for at undgå overreaktion.`);
  }
  explanation.push(`Anbefalet nyt mål: ${recommended} kcal (før ${input.currentTargetKcal} kcal).`);

  return {
    algorithm: ADAPTIVE_ALGORITHM,
    decision: "adjust",
    keepReasons: [],
    previousTargetKcal: input.currentTargetKcal,
    recommendedTargetKcal: recommended,
    observedTdeeKcal: Math.round(observedTdee),
    blendedTdeeKcal: Math.round(blended),
    trendKgPerWeek: kgPerWeek,
    averageIntakeKcal: Math.round(avgIntake),
    quality,
    explanation,
    timeline,
  };
}
