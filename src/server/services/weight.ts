import "server-only";
import { withUser, type Tx } from "@/lib/database/db";
import type { SessionUser } from "@/server/auth";
import { addDays } from "@/features/nutrition/domain/intake";
import { calculateMacros } from "@/features/nutrition/domain/energy";
import { ADAPTIVE_ALGORITHM, recommendCalories, type AdaptiveRecommendation } from "@/features/weight-tracking/domain/adaptive";
import { todayInCopenhagen } from "@/lib/format";
import { getActiveGoal, getAlgorithmVersionId, getProfile, replaceActiveGoal } from "@/server/repositories/profile";
import { estimateForProfile } from "./profile";
import { enforceRateLimit, LIMITS } from "./rate-limit";

export interface WeightEntry {
  id: string;
  measuredAt: string;
  weightKg: number;
  note: string | null;
}

export interface BodyMeasurement {
  id: string;
  measuredAt: string;
  bodyFatPercent: number | null;
  waistCm: number | null;
}

export interface StoredRecommendation {
  id: string;
  decision: "adjust" | "keep";
  previousTargetKcal: number;
  recommendedTargetKcal: number;
  observedTdeeKcal: number | null;
  blendedTdeeKcal: number | null;
  trendKgPerWeek: number | null;
  explanation: string[];
  status: "pending" | "accepted" | "rejected" | "superseded";
  createdAt: string;
  quality: AdaptiveRecommendation["quality"] & { timeline?: AdaptiveRecommendation["timeline"] };
}

export async function getWeightData(user: SessionUser) {
  return withUser(user.id, async (tx) => {
    const [weights, measurements, recs] = await Promise.all([
      tx`select id, measured_at, weight_kg, note from public.weight_entries where user_id = ${user.id} order by measured_at`,
      tx`select id, measured_at, body_fat_percent, waist_cm from public.body_measurements where user_id = ${user.id} order by measured_at desc limit 50`,
      tx`select * from public.calorie_recommendations where user_id = ${user.id} order by created_at desc limit 10`,
    ]);
    return {
      weights: weights.map((w): WeightEntry => ({ id: w.id, measuredAt: new Date(w.measured_at).toISOString(), weightKg: w.weight_kg, note: w.note })),
      measurements: measurements.map((m): BodyMeasurement => ({ id: m.id, measuredAt: new Date(m.measured_at).toISOString(), bodyFatPercent: m.body_fat_percent, waistCm: m.waist_cm })),
      recommendations: recs.map(mapRec),
    };
  });
}

function mapRec(r: Record<string, unknown>): StoredRecommendation {
  return {
    id: r.id as string,
    decision: r.decision as "adjust" | "keep",
    previousTargetKcal: r.previous_target_kcal as number,
    recommendedTargetKcal: r.recommended_target_kcal as number,
    observedTdeeKcal: r.observed_tdee_kcal as number | null,
    blendedTdeeKcal: r.blended_tdee_kcal as number | null,
    trendKgPerWeek: r.trend_kg_per_week as number | null,
    explanation: r.explanation as string[],
    status: r.status as StoredRecommendation["status"],
    createdAt: new Date(r.created_at as string).toISOString(),
    quality: r.quality as StoredRecommendation["quality"],
  };
}

export async function addWeight(user: SessionUser, measuredAt: Date, weightKg: number, note: string | null) {
  await withUser(user.id, (tx) => tx`insert into public.weight_entries (user_id, measured_at, weight_kg, note) values (${user.id}, ${measuredAt}, ${weightKg}, ${note})`);
}

export async function deleteWeight(user: SessionUser, id: string) {
  await withUser(user.id, (tx) => tx`delete from public.weight_entries where id = ${id} and user_id = ${user.id}`);
}

export async function addMeasurement(user: SessionUser, measuredAt: Date, bodyFatPercent: number | null, waistCm: number | null) {
  await withUser(user.id, (tx) => tx`
    insert into public.body_measurements (user_id, measured_at, body_fat_percent, waist_cm)
    values (${user.id}, ${measuredAt}, ${bodyFatPercent}, ${waistCm})`);
}

export async function deleteMeasurement(user: SessionUser, id: string) {
  await withUser(user.id, (tx) => tx`delete from public.body_measurements where id = ${id} and user_id = ${user.id}`);
}

async function buildAdaptiveInput(tx: Tx, userId: string) {
  const today = todayInCopenhagen();
  const from = addDays(today, -40);
  const [profile, goal, weights, intake, days, lastAdjust] = await Promise.all([
    getProfile(tx, userId),
    getActiveGoal(tx, userId),
    tx`select measured_at, weight_kg from public.weight_entries where user_id = ${userId} and measured_at >= ${from}::date - 1 order by measured_at`,
    tx`select entry_date, sum(energy_kcal)::float as kcal, count(*)::int as n from public.food_diary_entries
       where user_id = ${userId} and entry_date >= ${from} group by entry_date`,
    tx`select entry_date, marked_complete from public.food_diary_days where user_id = ${userId} and entry_date >= ${from}`,
    tx`select created_at from public.calorie_recommendations where user_id = ${userId} and decision = 'adjust' order by created_at desc limit 1`,
  ]);
  if (!profile || !goal) return null;
  const iso = (d: unknown) => (typeof d === "string" ? d.slice(0, 10) : (d as Date).toISOString().slice(0, 10));
  const complete = new Set(days.filter((d) => d.marked_complete).map((d) => iso(d.entry_date)));
  const latestWeight = weights.at(-1)?.weight_kg ?? null;
  if (latestWeight === null) return null;
  const estimate = estimateForProfile(profile, latestWeight);
  return {
    profile,
    goal,
    input: {
      today,
      weighIns: weights.map((w) => ({ measuredAt: new Date(w.measured_at).toISOString(), weightKg: w.weight_kg })),
      intake: intake.map((d) => ({ date: iso(d.entry_date), energyKcal: d.kcal, entryCount: d.n, markedComplete: complete.has(iso(d.entry_date)) })),
      currentTargetKcal: goal.energyKcal,
      priorTdeeKcal: goal.tdeeKcal ?? estimate?.tdeeKcal ?? goal.energyKcal,
      bmrKcal: goal.bmrKcal ?? estimate?.bmrKcal ?? 1200,
      goal: profile.goal ?? "maintenance",
      weeklyRatePercent: profile.weeklyRatePercent,
      currentWeightKg: latestWeight,
      goalWeightKg: profile.goalWeightKg,
      lastRecommendationDate: lastAdjust[0] ? iso(new Date(lastAdjust[0].created_at).toISOString()) : null,
      timeZone: profile.timezone,
    },
  };
}

/** Preview without persisting: used to show data quality and the timeline. */
export async function previewRecommendation(user: SessionUser): Promise<AdaptiveRecommendation | null> {
  return withUser(user.id, async (tx) => {
    const built = await buildAdaptiveInput(tx, user.id);
    return built ? recommendCalories(built.input) : null;
  });
}

/** Runs the adaptive algorithm and stores the result. Pending adjustments await the user's decision. */
export async function evaluateRecommendation(user: SessionUser): Promise<StoredRecommendation | null> {
  return withUser(user.id, async (tx) => {
    await enforceRateLimit(tx, LIMITS.recommendation);
    const built = await buildAdaptiveInput(tx, user.id);
    if (!built) return null;
    const rec = recommendCalories(built.input);
    const algorithmVersionId = await getAlgorithmVersionId(tx, ADAPTIVE_ALGORITHM.key, ADAPTIVE_ALGORITHM.version);
    await tx`update public.calorie_recommendations set status = 'superseded' where user_id = ${user.id} and status = 'pending'`;
    const [row] = await tx`
      insert into public.calorie_recommendations
        (user_id, algorithm_version_id, decision, previous_target_kcal, recommended_target_kcal, observed_tdee_kcal,
         blended_tdee_kcal, trend_kg_per_week, quality, explanation, status, decided_at)
      values (${user.id}, ${algorithmVersionId}, ${rec.decision}, ${rec.previousTargetKcal}, ${rec.recommendedTargetKcal},
              ${rec.observedTdeeKcal}, ${rec.blendedTdeeKcal}, ${rec.trendKgPerWeek},
              ${tx.json({ ...rec.quality, keepReasons: rec.keepReasons, timeline: rec.timeline } as never)}, ${rec.explanation},
              ${rec.decision === "adjust" ? "pending" : "accepted"}, ${rec.decision === "adjust" ? null : new Date()})
      returning *`;
    return mapRec(row);
  });
}

export async function decideRecommendation(user: SessionUser, id: string, accept: boolean): Promise<void> {
  await withUser(user.id, async (tx) => {
    const [rec] = await tx`select * from public.calorie_recommendations where id = ${id} and user_id = ${user.id} and status = 'pending'`;
    if (!rec) throw new Error("Anbefalingen findes ikke eller er allerede besvaret.");
    await tx`update public.calorie_recommendations set status = ${accept ? "accepted" : "rejected"}, decided_at = now() where id = ${id}`;
    if (!accept) return;
    const [profile, goal] = await Promise.all([getProfile(tx, user.id), getActiveGoal(tx, user.id)]);
    const [w] = await tx`select weight_kg from public.weight_entries where user_id = ${user.id} order by measured_at desc limit 1`;
    if (!profile || !goal || !profile.heightCm || !w) throw new Error("Profilen mangler oplysninger.");
    const macros = calculateMacros(rec.recommended_target_kcal, { weightKg: w.weight_kg, heightCm: profile.heightCm, goal: profile.goal ?? "maintenance" });
    await replaceActiveGoal(tx, user.id, {
      energyKcal: rec.recommended_target_kcal,
      proteinG: macros.proteinG,
      carbohydrateG: macros.carbohydrateG,
      fatG: macros.fatG,
      source: "adaptive",
      bmrKcal: goal.bmrKcal,
      tdeeKcal: rec.blended_tdee_kcal ?? goal.tdeeKcal,
      algorithmVersionId: rec.algorithm_version_id,
      notes: [{ code: "adaptive", recommendationId: id }],
    });
  });
}
