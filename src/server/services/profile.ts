import "server-only";
import { withUser } from "@/lib/database/db";
import type { SessionUser } from "@/server/auth";
import type { ProfileData } from "@/features/profile/schema";
import {
  estimateEnergy,
  INITIAL_TARGETS_ALGORITHM,
  type EnergyEstimate,
} from "@/features/nutrition/domain/energy";
import {
  getAlgorithmVersionId,
  getLatestWeightKg,
  getProfile,
  replaceActiveGoal,
  type Profile,
} from "@/server/repositories/profile";

export function ageFromBirthYear(birthYear: number, now = new Date()): number {
  // Birth year only (data minimisation); age may be off by up to one year.
  return now.getUTCFullYear() - birthYear;
}

/** Initial estimate for a complete profile, or null if fields are missing. */
export function estimateForProfile(p: Profile, weightKg: number | null): EnergyEstimate | null {
  if (!p.birthYear || !p.heightCm || !p.sex || !p.activityLevel || !p.goal || !weightKg)
    return null;
  return estimateEnergy({
    ageYears: ageFromBirthYear(p.birthYear),
    heightCm: p.heightCm,
    weightKg,
    sex: p.sex,
    activityLevel: p.activityLevel,
    goal: p.goal,
    weeklyRatePercent: p.weeklyRatePercent,
    goalWeightKg: p.goalWeightKg,
    trainingDaysPerWeek: p.trainingDaysPerWeek,
  });
}

/**
 * Persists the profile. On onboarding (or when `recalculateGoals` is set) the
 * current weight is logged and the nutrition goal is recalculated: estimated
 * with the documented algorithm, or taken from the user's own numbers.
 */
export async function saveProfile(
  user: SessionUser,
  d: ProfileData,
  opts: { onboarding: boolean; recalculateGoals: boolean },
): Promise<void> {
  await withUser(user.id, async (tx) => {
    await tx`
      update public.profiles set
        display_name = ${d.displayName || null},
        birth_year = ${d.birthYear},
        sex_for_calculation = ${d.sex},
        height_cm = ${d.heightCm},
        activity_level = ${d.activityLevel},
        training_days_per_week = ${d.trainingDaysPerWeek},
        primary_goal = ${d.goal},
        weekly_rate_percent = ${d.goal === "fat_loss" || d.goal === "muscle_gain" ? (d.weeklyRatePercent ?? null) : null},
        goal_weight_kg = ${d.goalWeightKg ?? null},
        target_body_fat_percent = ${d.targetBodyFatPercent ?? null},
        diet = ${d.diet},
        allergens = ${d.allergens},
        excluded_ingredients = ${d.excludedIngredients},
        disliked_ingredients = ${d.dislikedIngredients},
        allow_calorie_estimate = ${d.allowCalorieEstimate},
        meals_per_day = ${d.mealsPerDay},
        max_cooking_minutes = ${d.maxCookingMinutes ?? null},
        cooking_skill = ${d.cookingSkill},
        household_size = ${d.householdSize},
        weekly_budget_ore = ${d.weeklyBudgetKr === undefined ? null : Math.round(d.weeklyBudgetKr * 100)},
        postal_code = ${d.postalCode || null},
        onboarding_completed_at = coalesce(onboarding_completed_at, ${opts.onboarding ? new Date() : null})
      where id = ${user.id}`;

    const latest = await getLatestWeightKg(tx, user.id);
    if (opts.onboarding || latest === null || Math.abs(latest - d.weightKg) >= 0.05) {
      await tx`insert into public.weight_entries (user_id, measured_at, weight_kg) values (${user.id}, now(), ${d.weightKg})`;
    }

    if (opts.onboarding || opts.recalculateGoals) {
      const profile = (await getProfile(tx, user.id))!;
      const estimate = estimateForProfile(profile, d.weightKg);
      const algorithmVersionId = await getAlgorithmVersionId(
        tx,
        INITIAL_TARGETS_ALGORITHM.key,
        INITIAL_TARGETS_ALGORITHM.version,
      );
      if (!d.allowCalorieEstimate && d.customEnergyKcal !== undefined) {
        const kcal = Math.round(d.customEnergyKcal);
        // Fill any macro the user left empty from the documented split for their own calorie target.
        const fallback = estimate ? scaleMacros(estimate, kcal) : null;
        await replaceActiveGoal(tx, user.id, {
          energyKcal: kcal,
          proteinG: Math.round(d.customProteinG ?? fallback?.proteinG ?? (kcal * 0.25) / 4),
          carbohydrateG: Math.round(
            d.customCarbohydrateG ?? fallback?.carbohydrateG ?? (kcal * 0.45) / 4,
          ),
          fatG: Math.round(d.customFatG ?? fallback?.fatG ?? (kcal * 0.3) / 9),
          source: "user",
          bmrKcal: estimate?.bmrKcal ?? null,
          tdeeKcal: estimate?.tdeeKcal ?? null,
          algorithmVersionId: null,
          notes: [],
        });
      } else if (estimate) {
        await replaceActiveGoal(tx, user.id, {
          energyKcal: estimate.targetKcal,
          proteinG: estimate.macros.proteinG,
          carbohydrateG: estimate.macros.carbohydrateG,
          fatG: estimate.macros.fatG,
          source: "estimate",
          bmrKcal: estimate.bmrKcal,
          tdeeKcal: estimate.tdeeKcal,
          algorithmVersionId,
          notes: estimate.notes,
        });
      }
    }
  });
}

function scaleMacros(e: EnergyEstimate, kcal: number) {
  const f = kcal / e.targetKcal;
  return {
    proteinG: e.macros.proteinG,
    carbohydrateG: e.macros.carbohydrateG * f,
    fatG: e.macros.fatG * f,
  };
}
